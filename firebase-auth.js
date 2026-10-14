import {
    initializeApp,
    getApps,
    getApp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

/* =========================================================
   FIREBASE INITIALIZATION
   Initialize only once.
   ========================================================= */

const firebaseConfig = {
    apiKey: "AIzaSyDW86i3G7eLzX6SbxIk-11rdHMzJYZp4S8",
    authDomain: "muse-ae3dc.firebaseapp.com",
    projectId: "muse-ae3dc",
    storageBucket: "muse-ae3dc.firebasestorage.app",
    messagingSenderId: "286418803489",
    appId: "1:286418803489:web:4472ee6365bffb96c0bc60"
};

const app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

/* =========================================================
   HTML ELEMENTS
   ========================================================= */

const authForms = document.getElementById("auth-forms");
const signInForm = document.getElementById("sign-in-form");
const signUpForm = document.getElementById("sign-up-form");

const signedInPanel = document.getElementById("signed-in-panel");
const welcomeMessage = document.getElementById("welcome-message");
const authMessage = document.getElementById("auth-message");

const showSignUpButton = document.getElementById("show-sign-up");
const showSignInButton = document.getElementById("show-sign-in");

const resetPasswordButton =
    document.getElementById("reset-password-button");

const logoutButton = document.getElementById("logout-button");

const googleSignInButton =
    document.getElementById("google-sign-in-btn");

const googleSignUpButton =
    document.getElementById("google-sign-up-btn");

/* =========================================================
   MESSAGE HANDLING
   ========================================================= */

function showMessage(message) {
    if (authMessage) {
        authMessage.textContent = message;
    }
}

function clearMessage() {
    showMessage("");
}

function friendlyError(error) {
    switch (error.code) {
        case "auth/email-already-in-use":
            return "An account already exists with this email. Please sign in.";

        case "auth/invalid-email":
            return "Please enter a valid email address.";

        case "auth/weak-password":
            return "Your password is too weak. Please choose a stronger password.";

        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "Your email or password is incorrect.";

        case "auth/too-many-requests":
            return "Too many attempts. Please wait and try again.";

        case "auth/network-request-failed":
            return "Connection problem. Check your internet and try again.";

        case "auth/operation-not-allowed":
            return "This sign-in method is not enabled in Firebase.";

        case "auth/popup-closed-by-user":
            return "Google sign-in was cancelled.";

        case "auth/popup-blocked":
            return "Your browser blocked the Google sign-in popup. Allow popups and try again.";

        case "auth/unauthorized-domain":
            return "This website domain is not authorized in Firebase.";

        case "auth/account-exists-with-different-credential":
            return "An account already exists with this email. Try your existing sign-in method.";

        case "auth/cancelled-popup-request":
            return "Another sign-in popup is already open. Please try again.";

        default:
            console.error("Firebase authentication error:", error.code);
            return "Something went wrong. Please try again.";
    }
}

/* =========================================================
   FORM SWITCHING
   ========================================================= */

showSignUpButton?.addEventListener("click", () => {
    if (!signInForm || !signUpForm) return;

    signInForm.hidden = true;
    signUpForm.hidden = false;

    clearMessage();
});

showSignInButton?.addEventListener("click", () => {
    if (!signInForm || !signUpForm) return;

    signUpForm.hidden = true;
    signInForm.hidden = false;

    clearMessage();
});

/* =========================================================
   CREATE ACCOUNT WITH EMAIL AND PASSWORD
   ========================================================= */

signUpForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const displayName =
        document.getElementById("display-name")?.value.trim() || "";

    const email =
        document.getElementById("sign-up-email")?.value.trim() || "";

    const password =
        document.getElementById("sign-up-password")?.value || "";

    const confirmPassword =
        document.getElementById("confirm-password")?.value || "";

    if (!displayName) {
        showMessage("Please enter your display name.");
        document.getElementById("display-name")?.focus();
        return;
    }

    if (password !== confirmPassword) {
        showMessage("Your passwords do not match.");
        document.getElementById("confirm-password")?.focus();
        return;
    }

    if (password.length < 8) {
        showMessage("Your password must contain at least 8 characters.");
        return;
    }

    const submitButton = signUpForm.querySelector(
        'button[type="submit"]'
    );

    if (submitButton) {
        submitButton.disabled = true;
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

        signUpForm.reset();

        showMessage("Your account has been created successfully!");

    } catch (error) {
        showMessage(friendlyError(error));

    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
});

/* =========================================================
   SIGN IN WITH EMAIL AND PASSWORD
   ========================================================= */

signInForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const email =
        document.getElementById("sign-in-email")?.value.trim() || "";

    const password =
        document.getElementById("sign-in-password")?.value || "";

    const submitButton = signInForm.querySelector(
        'button[type="submit"]'
    );

    if (submitButton) {
        submitButton.disabled = true;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);

        signInForm.reset();

        showMessage("You have signed in successfully!");

    } catch (error) {
        showMessage(friendlyError(error));

    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
});

/* =========================================================
   GOOGLE SIGN-IN AND SIGN-UP
   Both buttons use the same Firebase Google provider.
   ========================================================= */

async function handleGoogleAuth() {
    clearMessage();

    const googleButtons = [
        googleSignInButton,
        googleSignUpButton
    ].filter(Boolean);

    googleButtons.forEach((button) => {
        button.disabled = true;
    });

    showMessage("Connecting to Google...");

    try {
        await signInWithPopup(auth, googleProvider);

        showMessage("You have signed in with Google successfully!");

    } catch (error) {
        showMessage(friendlyError(error));

    } finally {
        googleButtons.forEach((button) => {
            button.disabled = false;
        });
    }
}

googleSignInButton?.addEventListener("click", handleGoogleAuth);
googleSignUpButton?.addEventListener("click", handleGoogleAuth);

/* =========================================================
   FORGOT PASSWORD
   Sends a real Firebase password-reset email.
   ========================================================= */

resetPasswordButton?.addEventListener("click", async () => {
    clearMessage();

    const email =
        document.getElementById("sign-in-email")?.value.trim() || "";

    if (!email) {
        showMessage("Please enter your email address first.");

        document.getElementById("sign-in-email")?.focus();
        return;
    }

    resetPasswordButton.disabled = true;

    try {
        await sendPasswordResetEmail(auth, email);

        showMessage(
            "If an account exists for this email, password-reset instructions will be sent."
        );

    } catch (error) {
        showMessage(friendlyError(error));

    } finally {
        resetPasswordButton.disabled = false;
    }
});

/* =========================================================
   SIGN OUT
   ========================================================= */

logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
        await signOut(auth);

        showMessage("You have logged out successfully.");

    } catch (error) {
        showMessage(friendlyError(error));

    } finally {
        logoutButton.disabled = false;
    }
});

/* =========================================================
   AUTHENTICATION STATE
   Firebase manages the signed-in session.
   No passwords or duplicate sessions are stored in localStorage.
   ========================================================= */

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (authForms) {
            authForms.hidden = true;
        }

        if (signedInPanel) {
            signedInPanel.hidden = false;
        }

        if (welcomeMessage) {
            welcomeMessage.textContent =
                `Welcome, ${user.displayName || user.email || "MUSE user"}!`;
        }

    } else {
        if (authForms) {
            authForms.hidden = false;
        }

        if (signedInPanel) {
            signedInPanel.hidden = true;
        }
    }
});