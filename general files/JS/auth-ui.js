import {
    initializeApp,
    getApps,
    getApp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDW86i3G7eLzX6SbxIk-11rdHMzJYZp4S8",
    authDomain: "muse-ae3dc.firebaseapp.com",
    projectId: "muse-ae3dc",
    storageBucket: "muse-ae3dc.firebasestorage.app",
    messagingSenderId: "286418803489",
    appId: "1:286418803489:web:4472ee6365bffb96c0bc60"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const accountNavLink = document.getElementById("account-nav-link");
const profileLogoutButton = document.getElementById("profile-logout-button");
const profilePage = document.documentElement.classList.contains("auth-pending");
const profileStorageKey = "muse.profile.v1";

function profileAvatarUrl() {
    let avatarId = 1;

    try {
        const savedProfile = JSON.parse(localStorage.getItem(profileStorageKey));
        if (Number.isInteger(savedProfile?.avatarId)
            && savedProfile.avatarId >= 1 && savedProfile.avatarId <= 20) {
            avatarId = savedProfile.avatarId;
        }
    } catch (error) {
        // Use the default avatar when browser storage is unavailable.
    }

    const filename = `avatar-${String(avatarId).padStart(2, "0")}.webp`;
    return new URL(`../../assets/avatars/${filename}`, import.meta.url).href;
}

function renderAccountLink(user) {
    if (!accountNavLink) return;

    if (user) {
        const avatar = document.createElement("img");
        avatar.className = "nav-account-avatar";
        avatar.src = profileAvatarUrl();
        avatar.alt = "";
        accountNavLink.href = "profile.html";
        accountNavLink.classList.add("nav-account-link");
        accountNavLink.setAttribute("aria-label", "Profile");
        accountNavLink.replaceChildren(avatar);

        if (profilePage) {
            accountNavLink.setAttribute("aria-current", "page");
        }
        return;
    }

    accountNavLink.href = "login.html";
    accountNavLink.classList.remove("nav-account-link");
    accountNavLink.removeAttribute("aria-label");
    accountNavLink.removeAttribute("aria-current");
    accountNavLink.textContent = "Sign In";
}

onAuthStateChanged(auth, (user) => {
    renderAccountLink(user);

    if (profilePage) {
        if (!user) {
            window.location.replace("login.html");
            return;
        }

        document.documentElement.classList.remove("auth-pending");
    }
});

profileLogoutButton?.addEventListener("click", async () => {
    profileLogoutButton.disabled = true;
    try {
        await signOut(auth);
    } catch (error) {
        const status = document.getElementById("profileStatus");
        if (status) status.textContent = "Could not log out. Please try again.";
        profileLogoutButton.disabled = false;
    }
});

window.addEventListener("muse:profile-updated", () => {
    if (auth.currentUser) renderAccountLink(auth.currentUser);
});

window.addEventListener("storage", (event) => {
    if (event.key === profileStorageKey && auth.currentUser) {
        renderAccountLink(auth.currentUser);
    }
});