/* Personal profile stored in this browser. No account is required. */
(function () {
    'use strict';
    const KEY = 'muse.profile.v1';
    const MAX_CHARACTERS = 20;
    const avatars = [
        'Quokka', 'Cassowary', 'Manatee', 'Pangolin', 'Tapir',
        'Nautilus', 'Moon moth', 'Kettle bot', 'Nautilus II', 'Rain boot',
        'Horseshoe magnet', 'Musk ox', 'Seahorse', 'Pitcher plant', 'Tapir II',
        'Armadillo', 'Rice cooker bot', 'Accordion', 'Scarab beetle', 'Mushroom knight'
    ].map((name, index) => ({
        id: index + 1, name,
        src: `../../assets/avatars/avatar-${String(index + 1).padStart(2, '0')}.webp`
    }));
    const input = document.getElementById('profileUsername');
    if (!input) return;
    const picture = document.getElementById('profileAvatar');
    const count = document.getElementById('usernameCount');
    const status = document.getElementById('profileStatus');
    const dialog = document.getElementById('avatarDialog');
    const grid = document.getElementById('avatarGrid');
    const segmenter = typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    const characters = text => segmenter
        ? Array.from(segmenter.segment(text), part => part.segment) : Array.from(text);
    const limit = text => characters(text).slice(0, MAX_CHARACTERS).join('');
    let profile = { username: 'MUSE Dancer', avatarId: 1 };
    let selectedAvatar = profile.avatarId;
    let composing = false;
    let returnFocus;

    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && typeof saved.username === 'string') profile.username = limit(saved.username);
        if (saved && avatars.some(avatar => avatar.id === saved.avatarId)) profile.avatarId = saved.avatarId;
    } catch (error) { /* Keep the default profile if storage is unavailable or invalid. */ }

    function save(message = 'Saved') {
        try { localStorage.setItem(KEY, JSON.stringify(profile)); status.textContent = message; }
        catch (error) { status.textContent = 'Changes work for now, but this browser could not save them.'; }
    }

    function renderAvatar() {
        const avatar = avatars.find(item => item.id === profile.avatarId);
        picture.src = avatar.src;
        picture.alt = `${avatar.name} profile picture`;
    }

    function updateUsername() {
        const original = input.value;
        input.value = limit(original);
        count.textContent = `${characters(input.value).length} / ${MAX_CHARACTERS}`;
        profile.username = input.value;
        save(original !== input.value ? 'Username is limited to 20 characters.' : 'Saved');
    }

    input.value = profile.username;
    count.textContent = `${characters(profile.username).length} / ${MAX_CHARACTERS}`;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; updateUsername(); });
    input.addEventListener('input', () => { if (!composing) updateUsername(); });
    input.addEventListener('keydown', event => {
        // Enter used to confirm Chinese/other IME input is not a save action.
        if (event.key !== 'Enter' || event.isComposing || composing || event.keyCode === 229) return;
        event.preventDefault();
        updateUsername();
        input.blur();
    });
    renderAvatar();

    avatars.forEach(avatar => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'profile-avatar-option';
        button.dataset.avatarId = avatar.id;
        button.setAttribute('aria-label', `Choose ${avatar.name}`);
        button.setAttribute('aria-pressed', 'false');
        const image = document.createElement('img');
        image.src = avatar.src;
        image.alt = '';
        image.width = image.height = 96;
        image.loading = 'lazy';
        button.appendChild(image);
        button.addEventListener('click', () => {
            selectedAvatar = avatar.id;
            renderSelection();
        });
        grid.appendChild(button);
    });

    function renderSelection() {
        grid.querySelectorAll('button').forEach(button => {
            button.setAttribute('aria-pressed', String(Number(button.dataset.avatarId) === selectedAvatar));
        });
    }

    function openPicker(event) {
        returnFocus = event.currentTarget;
        selectedAvatar = profile.avatarId;
        renderSelection();
        dialog.showModal();
        grid.querySelector('[aria-pressed="true"]').focus();
    }

    document.getElementById('chooseAvatar').addEventListener('click', openPicker);
    document.getElementById('changeAvatar').addEventListener('click', openPicker);
    document.getElementById('closeAvatarDialog').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right
            || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => returnFocus?.focus());
    document.getElementById('saveAvatar').addEventListener('click', () => {
        profile.avatarId = selectedAvatar;
        renderAvatar();
        save('Profile picture saved');
        dialog.close();
    });

    function renderStreak() {
        const streak = window.MUSE.streak.get() || { count: 1 };
        document.getElementById('profileStreak').textContent = streak.count;
        document.getElementById('profileStreakUnit').textContent = streak.count === 1 ? 'day' : 'days';
        document.getElementById('streakCaption').textContent = streak.count === 1
            ? 'Your first step. Keep the rhythm going.' : `${streak.count} days of showing up for yourself.`;
        const week = document.getElementById('profileWeek');
        week.replaceChildren();
        const today = new Date();
        for (let ago = 6; ago >= 0; ago--) {
            const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ago);
            const visited = ago < streak.count;
            const day = document.createElement('div');
            day.className = `profile-week-day${visited ? ' is-visited' : ''}${ago === 0 ? ' is-today' : ''}`;
            day.setAttribute('aria-label', `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${visited ? 'visited' : 'no visit in this streak'}`);
            const label = document.createElement('span');
            label.textContent = ago === 0 ? 'Today' : date.toLocaleDateString('en', { weekday: 'short' });
            const dot = document.createElement('span');
            dot.className = 'profile-week-dot';
            dot.textContent = visited ? '✓' : '·';
            dot.setAttribute('aria-hidden', 'true');
            day.append(label, dot);
            week.appendChild(day);
        }
        if (!window.MUSE.streak.isPersistent()) {
            status.textContent = 'This browser could not save your streak. Enable browser storage to keep it.';
        }
    }

    renderStreak();
    window.addEventListener('muse:streak', renderStreak);
    window.addEventListener('storage', event => {
        if (event.key !== KEY || !event.newValue || document.activeElement === input) return;
        try {
            const saved = JSON.parse(event.newValue);
            if (typeof saved.username === 'string') profile.username = limit(saved.username);
            if (avatars.some(avatar => avatar.id === saved.avatarId)) profile.avatarId = saved.avatarId;
            input.value = profile.username;
            count.textContent = `${characters(profile.username).length} / ${MAX_CHARACTERS}`;
            renderAvatar();
        } catch (error) { /* Ignore malformed data from other tabs. */ }
    });
})();
