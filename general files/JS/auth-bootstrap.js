(() => {
    const accountNavLink = document.getElementById("account-nav-link");
    if (!accountNavLink) return;

    let hasCachedSession = false;
    try {
        hasCachedSession = localStorage.getItem("muse.authenticated.v1") === "true";
    } catch (error) {
        // Keep the default Sign In link when browser storage is unavailable.
    }

    if (hasCachedSession) {
        let avatarId = 1;
        try {
            const savedProfile = JSON.parse(localStorage.getItem("muse.profile.v1"));
            if (Number.isInteger(savedProfile?.avatarId)
                && savedProfile.avatarId >= 1 && savedProfile.avatarId <= 20) {
                avatarId = savedProfile.avatarId;
            }
        } catch (error) {
            // Use the default avatar when browser storage is unavailable.
        }

        const filename = `avatar-${String(avatarId).padStart(2, "0")}.webp`;
        const avatar = document.createElement("img");
        avatar.className = "nav-account-avatar";
        avatar.src = new URL(`../../assets/avatars/${filename}`, document.baseURI).href;
        avatar.alt = "";
        accountNavLink.href = "profile.html";
        accountNavLink.classList.add("nav-account-link");
        accountNavLink.setAttribute("aria-label", "Profile");
        accountNavLink.replaceChildren(avatar);

        if (window.location.pathname.endsWith("/profile.html")) {
            accountNavLink.setAttribute("aria-current", "page");
        }
    }

    document.documentElement.classList.remove("auth-cached");
})();