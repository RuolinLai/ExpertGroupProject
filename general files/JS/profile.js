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
        window.dispatchEvent(new Event('muse:profile-updated'));
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

        /* Stats come from muse.syncHistory (scores 0-1). pose-sync.js adds a session there automatically each
       time an uploaded recording finishes analyzing, and when "Save session" is pressed on the Features page.
       This page redraws whenever that list changes: on load, on tab focus/return, and when another tab saves. */
    const SYNC_HISTORY_KEY = 'muse.syncHistory';
    const DAY = 86400000;
    const percent = value => Math.round(value * 100) + '%';

    function readSessions() {
        try {
            const sessions = JSON.parse(localStorage.getItem(SYNC_HISTORY_KEY)) || [];
            return Array.isArray(sessions)
                ? sessions.filter(s => s && typeof s.avg === 'number' && typeof s.date === 'number') : [];
        } catch (error) { return []; }
    }
    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const mean = (list, key) => list.reduce((sum, item) => sum + (item[key] || 0), 0) / list.length;

    function formatDuration(seconds) {
        if (seconds < 60) return `${Math.round(seconds)} sec`;
        if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
        return `${(seconds / 3600).toFixed(1)} hrs`;
    }

    function setBar(name, value) {
        const fill = document.getElementById('bar-' + name);
        if (fill) fill.style.width = value == null ? '0%' : Math.round(value * 100) + '%';
        setText('val-' + name, value == null ? '--' : percent(value));
    }

    /* Bars: minutes practised on each of the last 7 days. */
    function renderWeek(sessions) {
        const holder = document.getElementById('week-graph');
        if (!holder) return;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const days = Array.from({ length: 7 }, (_, i) => {
            const start = today.getTime() - (6 - i) * DAY;
            const secs = sessions.filter(s => s.date >= start && s.date < start + DAY)
                .reduce((sum, s) => sum + (s.secs || 0), 0);
            return { start, secs, label: new Date(start).toLocaleDateString(undefined, { weekday: 'narrow' }) };
        });
        const max = Math.max(60, ...days.map(day => day.secs));
        holder.innerHTML = days.map(day => `
            <div class="muse-mini-col" title="${new Date(day.start).toLocaleDateString()}: ${formatDuration(day.secs)}">
                <span class="muse-mini-bar${day.secs ? '' : ' empty'}" style="height:${day.secs ? Math.max(10, Math.round(day.secs / max * 100)) : 6}%"></span>
                <span class="muse-mini-label">${day.label}</span>
            </div>`).join('');
        const active = days.filter(day => day.secs > 0).length;
        setText('time-point-summary', active
            ? `Active on ${active} of the last 7 days`
            : 'Start recording to track days');
    }

    /* Line + soft area: accuracy of up to the last 12 sessions. */
    function renderGrowth(sessions) {
        const holder = document.getElementById('growth-graph');
        if (!holder) return;
        const recent = sessions.slice(-12);
        if (recent.length < 2) {
            holder.innerHTML = '<span class="muse-graph-empty">' + (recent.length ? 'One more session to draw your line' : 'No sessions yet') + '</span>';
            setText('growth-summary', recent.length ? 'Analyze another session to see growth' : 'Complete a session to see progress');
            return;
        }
        const W = 200, H = 60, pad = 6;
        const x = i => pad + i / (recent.length - 1) * (W - pad * 2);
        const y = v => pad + (1 - v) * (H - pad * 2);
        const points = recent.map((s, i) => `${x(i).toFixed(1)},${y(s.avg).toFixed(1)}`);
        holder.innerHTML = `
            <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-hidden="true">
                <polygon points="${x(0)},${H - pad} ${points.join(' ')} ${x(recent.length - 1)},${H - pad}" class="muse-line-area"/>
                <polyline points="${points.join(' ')}" class="muse-line"/>
                <circle cx="${x(recent.length - 1).toFixed(1)}" cy="${y(recent[recent.length - 1].avg).toFixed(1)}" r="3" class="muse-line-dot"/>
            </svg>`;
        const change = Math.round((recent[recent.length - 1].avg - recent[0].avg) * 100);
        setText('growth-summary', `Accuracy ${change >= 0 ? '+' : ''}${change}% over your last ${recent.length} sessions`);
    }

    function renderStats() {
        const sessions = readSessions().sort((a, b) => a.date - b.date);
        const totalSeconds = sessions.reduce((sum, s) => sum + (s.secs || 0), 0);
        setText('stat-sessions', sessions.length);
        setText('stat-learning-time', formatDuration(totalSeconds));
        renderWeek(sessions);
        renderGrowth(sessions);

        if (!sessions.length) {
            setText('stat-accuracy', '--');
            setText('stat-best', '--');
            ['timing', 'align', 'energy'].forEach(name => setBar(name, null));
            setText('stat-focus', 'Analyze a recording on the Features page to see your numbers here.');
            return;
        }
        setText('stat-accuracy', percent(mean(sessions, 'avg')));
        setText('stat-best', percent(Math.max(...sessions.map(s => s.avg))));
        const averages = { timing: mean(sessions, 'timing'), align: mean(sessions, 'align'), energy: mean(sessions, 'energy') };
        Object.entries(averages).forEach(([name, value]) => setBar(name, value));

        const weakest = Object.entries(averages).sort((a, b) => a[1] - b[1])[0];
        const hints = {
            timing: 'Timing is your weakest area: try starting each move a touch earlier.',
            align: 'Align is your weakest area: watch the dancer\'s angles and copy them closely.',
            energy: 'Energy is your weakest area: make your moves bigger and sharper.'
        };
        setText('stat-focus', weakest[1] >= 0.85 ? 'Excellent across the board. Keep it up!' : hints[weakest[0]]);
    }

    renderStats();
    document.addEventListener('muse:statsupdate', renderStats);
    window.addEventListener('storage', event => {
        if (event.key === SYNC_HISTORY_KEY || event.key === null) renderStats();
    });
    window.addEventListener('pageshow', renderStats);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderStats(); });
})();