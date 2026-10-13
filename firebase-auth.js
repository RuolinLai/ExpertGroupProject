
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

// Keep the real configuration generated for your MUSE project.
// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDW86i3G7eLzX6SbxIk-11rdHMzJYZp4S8",
    authDomain: "muse-ae3dc.firebaseapp.com",
    projectId: "muse-ae3dc",
    storageBucket: "muse-ae3dc.firebasestorage.app",
    messagingSenderId: "286418803489",
    appId: "1:286418803489:web:4472ee6365bffb96c0bc60"
};

// Connect MUSE to Firebase.
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Get the elements from login.html.
const authForms = document.getElementById("auth-forms");
const signInForm = document.getElementById("sign-in-form");
const signUpForm = document.getElementById("sign-up-form");
const signedInPanel = document.getElementById("signed-in-panel");
const welcomeMessage = document.getElementById("welcome-message");
const message = document.getElementById("auth-message");

const showSignUpButton = document.getElementById("show-sign-up");
const showSignInButton = document.getElementById("show-sign-in");
const resetPasswordButton = document.getElementById("reset-password-button");
const logoutButton = document.getElementById("logout-button");

// Display messages without showing raw technical errors.
function showMessage(text) {
    message.textContent = text;
}

function friendlyError(error) {
    switch (error.code) {
        case "auth/email-already-in-use":
            return "An account already exists with this email. Try signing in.";
        case "auth/invalid-email":
            return "Please enter a valid email address.";
        case "auth/weak-password":
            return "Your password is too weak. Please choose a stronger one.";
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "Your email or password is incorrect. Please try again.";
        case "auth/too-many-requests":
            return "Too many attempts. Please wait a little before trying again.";
        case "auth/network-request-failed":
            return "Connection problem. Check your internet and try again.";
        case "auth/operation-not-allowed":
            return "Email/Password sign-in is not enabled in Firebase yet.";
        default:
            return "Something went wrong. Please try again.";
    }
}

// Switch to Create Account.
showSignUpButton.addEventListener("click", () => {
    signInForm.hidden = true;
    signUpForm.hidden = false;
    showMessage("");
});

// Switch to Sign In.
showSignInButton.addEventListener("click", () => {
    signUpForm.hidden = true;
    signInForm.hidden = false;
    showMessage("");
});

// Create a new account.
signUpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("");

    const displayName = document.getElementById("display-name").value.trim();
    const email = document.getElementById("sign-up-email").value.trim();
    const password = document.getElementById("sign-up-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    if (password !== confirmPassword) {
        showMessage("Your passwords do not match.");
        return;
    }

    if (!displayName) {
        showMessage("Please enter a display name.");
        return;
    }

    try {
        const credential = await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        await updateProfile(credential.user, {
            displayName: displayName
        });

        showMessage("Your account has been created successfully!");
        signUpForm.reset();
    } catch (error) {
        showMessage(friendlyError(error));
        console.error("Account creation failed:", error.code);
    }
});

// Sign in to an existing account.
signInForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("");

    const email = document.getElementById("sign-in-email").value.trim();
    const password = document.getElementById("sign-in-password").value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        showMessage("You have signed in successfully!");
        signInForm.reset();
    } catch (error) {
        showMessage(friendlyError(error));
        console.error("Sign-in failed:", error.code);
    }
});

// Send a password-reset email.
resetPasswordButton.addEventListener("click", async () => {
    const email = document.getElementById("sign-in-email").value.trim();

    if (!email) {
        showMessage("Enter your email in the Sign In form first.");
        document.getElementById("sign-in-email").focus();
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        showMessage(
            "If an account can receive a reset email, instructions will be sent."
        );
    } catch (error) {
        showMessage(friendlyError(error));
        console.error("Password reset failed:", error.code);
    }
});

// Sign out.
logoutButton.addEventListener("click", async () => {
    try {
        await signOut(auth);
        showMessage("You have logged out.");
    } catch (error) {
        showMessage("We couldn't log you out. Please try again.");
        console.error("Sign-out failed:", error.code);
    }
});

// Keep the page updated when the user signs in or out.
onAuthStateChanged(auth, (user) => {
    if (user) {
        authForms.hidden = true;
        signedInPanel.hidden = false;

        welcomeMessage.textContent =
            `Welcome, ${user.displayName || user.email}!`;
    } else {
        authForms.hidden = false;
        signedInPanel.hidden = true;
    }
});

