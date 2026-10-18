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

    /* Line + soft area: accuracy of up to the last 12 sessions, with each score above its point and the
       session number below. Drawn at the box's real pixel size so the labels never stretch. */
    function renderGrowth(sessions) {
        const holder = document.getElementById('growth-graph-visual');
        if (!holder) return;
        const recent = sessions.slice(-12);
        if (recent.length < 2) {
            holder.innerHTML = '<span class="muse-graph-empty">' + (recent.length ? 'One more session to draw your line' : 'No sessions yet') + '</span>';
            setText('growth-summary', recent.length ? 'Analyze another session to see growth' : 'Complete a session to see progress');
            return;
        }
        const W = holder.clientWidth, H = holder.clientHeight;
        if (!W || !H) return;
        const first = sessions.length - recent.length + 1;            // same numbering as Session History
        const padX = 20, top = 24, bottom = 26;
        const x = i => padX + i / (recent.length - 1) * (W - padX * 2);
        const y = v => top + (1 - v) * (H - top - bottom);
        const points = recent.map((s, i) => `${x(i).toFixed(1)},${y(s.avg).toFixed(1)}`).join(' ');
        const grid = [0, 0.5, 1].map(v =>
            `<line x1="${padX}" x2="${W - padX}" y1="${y(v)}" y2="${y(v)}" class="muse-growth-grid"/>`).join('');
        const marks = recent.map((s, i) => {
            const latest = i === recent.length - 1;
            return `
                <circle cx="${x(i).toFixed(1)}" cy="${y(s.avg).toFixed(1)}" r="${latest ? 4.5 : 3.5}"
                    class="muse-growth-dot${latest ? ' latest' : ''}"><title>Session ${first + i}: ${percent(s.avg)}</title></circle>
                <text x="${x(i).toFixed(1)}" y="${(y(s.avg) - 9).toFixed(1)}" class="muse-growth-score">${percent(s.avg)}</text>
                <text x="${x(i).toFixed(1)}" y="${H - 8}" class="muse-growth-session">S${first + i}</text>`;
        }).join('');
        holder.innerHTML = `
            <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
                aria-label="Overall score for sessions ${first} to ${sessions.length}">
                ${grid}
                <polygon points="${x(0)},${y(0)} ${points} ${x(recent.length - 1)},${y(0)}" class="muse-line-area"/>
                <polyline points="${points}" class="muse-line"/>
                ${marks}
            </svg>`;
        const change = Math.round((recent[recent.length - 1].avg - recent[0].avg) * 100);
        setText('growth-summary', `Accuracy ${change >= 0 ? '+' : ''}${change}% over your last ${recent.length} sessions`);
    }

    /* Radar: average score for each body part pose-sync.js tracks (stored in each session's "parts"). */
    const RADAR_PARTS = ['left arm', 'right arm', 'left leg', 'right leg', 'upper body'];
    let radarChart = null;

    function renderRadar(sessions) {
        const canvas = document.getElementById('skillRadarCanvas');
        if (!canvas || typeof Chart === 'undefined') return;
        const values = RADAR_PARTS.map(name => {
            const scores = sessions.flatMap(s => (s.parts || [])
                .filter(p => p.name === name && typeof p.v === 'number').map(p => p.v));
            return scores.length ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length * 100) : 0;
        });
        if (radarChart) {
            radarChart.data.datasets[0].data = values;
            radarChart.update();
            return;
        }
        radarChart = new Chart(canvas, {
            type: 'radar',
            data: {
                labels: RADAR_PARTS.map(name => name.replace(/\b\w/g, c => c.toUpperCase())),
                datasets: [{
                    label: 'Average score',
                    data: values,
                    backgroundColor: 'rgba(196, 176, 255, 0.25)',
                    borderColor: '#c4b0ff',
                    pointBackgroundColor: '#ff7ebb',
                    pointBorderColor: '#120e18',
                    pointHoverBackgroundColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        pointLabels: { color: 'rgba(255, 255, 255, 0.75)', font: { size: 11 } },
                        ticks: { display: false, stepSize: 25 }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: item => `${item.raw}%` } }
                }
            }
        });
    }

    /* Session History: the same report as the Features page's Synchronization Analyzer, for any saved
       session. Timeline, lag, energy direction and hardest part are only saved by newer versions of
       pose-sync.js, so older sessions show those parts as unavailable. */
    const pct = value => typeof value === 'number' ? percent(value) : '--';
    const clock = sec => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
    const labelFor = o => o >= 0.85 ? 'Excellent sync!' : o >= 0.7 ? 'Good sync' : o >= 0.5 ? 'Getting there' : 'Out of sync';
    const sessionEl = Object.fromEntries(['select', 'prev', 'next', 'empty', 'detail', 'ring', 'score', 'label',
        'hint', 'meta', 'timing', 'align', 'energy', 'chart', 'parts', 'tips']
        .map(name => [name, document.getElementById('session-' + name)]));
    let allSessions = [];
    let shownIndex = -1;
    let followNewest = true;               // keep showing the newest session until another one is picked

    function sessionTitle(s, i) {
        const d = new Date(s.date);
        return `Session ${i + 1} · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, `
            + `${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · ${percent(s.avg)}`;
    }

    function renderSessionHistory() {
        if (!sessionEl.select) return;
        const sessions = allSessions;
        sessionEl.empty.hidden = sessions.length > 0;
        sessionEl.detail.hidden = !sessions.length;
        if (!sessions.length) {
            sessionEl.select.innerHTML = '';
            sessionEl.prev.disabled = sessionEl.next.disabled = sessionEl.select.disabled = true;
            return;
        }
        if (followNewest || shownIndex < 0 || shownIndex >= sessions.length) shownIndex = sessions.length - 1;
        sessionEl.select.innerHTML = sessions.map((s, i) => `<option value="${i}">${sessionTitle(s, i)}</option>`)
            .reverse().join('');                                        // newest first in the list
        sessionEl.select.value = String(shownIndex);
        sessionEl.select.disabled = false;
        sessionEl.prev.disabled = shownIndex === 0;
        sessionEl.next.disabled = shownIndex === sessions.length - 1;

        const s = sessions[shownIndex];
        sessionEl.ring.style.setProperty('--p', Math.round(s.avg * 100));
        sessionEl.score.textContent = percent(s.avg);
        sessionEl.label.textContent = labelFor(s.avg) + ' (session average)';
        sessionEl.hint.textContent = new Date(s.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            + (s.source === 'manual' ? ' · saved with “Save session”' : s.source === 'recording' ? ' · analyzed recording'
                : s.source === 'camera' ? ' · camera, full video' : '');
        sessionEl.meta.textContent = 'Danced ' + clock(s.secs || 0)
            + (typeof s.lag === 'number' ? ' · on average ' + s.lag.toFixed(2) + 's behind' : '')
            + (s.mirror ? ' · mirror mode' : '');
        sessionEl.timing.textContent = pct(s.timing);
        sessionEl.align.textContent = pct(s.align);
        sessionEl.energy.textContent = pct(s.energy);
        renderSessionChart(s);
        renderSessionParts(s);
        sessionEl.tips.innerHTML = sessionTips(s).map(t => '<li>' + t + '</li>').join('');
    }

    function showSession(index) {
        shownIndex = Math.max(0, Math.min(allSessions.length - 1, index));
        followNewest = shownIndex === allSessions.length - 1;
        renderSessionHistory();
    }

    /* score over time, drawn like the Analyzer's chart: 0/50/100% grid, dashed session average, hover tooltip */
    function renderSessionChart(s) {
        const box = sessionEl.chart;
        const pts = Array.isArray(s.samples) ? s.samples.filter(p => typeof p.s === 'number' && typeof p.o === 'number') : [];
        box.geom = null;
        if (pts.length < 4) {
            box.innerHTML = '<div class="sync-chart-empty"><p class="sync-empty">' + (Array.isArray(s.samples)
                ? 'This session was too short to draw a timeline.'
                : 'No timeline was saved for this session (it was recorded before timelines were kept).') + '</p></div>';
            return;
        }
        const W = box.clientWidth, H = box.clientHeight;
        if (!W || !H) return;
        const L = 34, R = 8, T = 8, B = 20, pw = W - L - R, ph = H - T - B;
        const s0 = pts[0].s, s1 = pts[pts.length - 1].s, span = Math.max(1, s1 - s0);
        const X = p => L + (p.s - s0) / span * pw, Y = v => T + ph * (1 - v);
        const line = pts.map(p => `${X(p).toFixed(1)},${Y(p.o).toFixed(1)}`).join(' ');
        const grid = [0, 50, 100].map(v => `
            <line x1="${L}" x2="${W - R}" y1="${Y(v / 100)}" y2="${Y(v / 100)}" class="muse-growth-grid"/>
            <text x="${L - 6}" y="${Y(v / 100)}" class="muse-chart-axis" text-anchor="end" dominant-baseline="middle">${v}%</text>`).join('');
        box.innerHTML = `
            <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Score over time">
                ${grid}
                <text x="${L}" y="${H - 5}" class="muse-chart-axis">${clock(s0)}</text>
                <text x="${W - R}" y="${H - 5}" class="muse-chart-axis" text-anchor="end">${clock(s1)}</text>
                <polygon points="${X(pts[0])},${Y(0)} ${line} ${X(pts[pts.length - 1])},${Y(0)}" class="muse-line-area"/>
                <polyline points="${line}" class="muse-line"/>
                <line x1="${L}" x2="${W - R}" y1="${Y(s.avg)}" y2="${Y(s.avg)}" class="muse-chart-avg"/>
                <text x="${W - R}" y="${Y(s.avg) - 4}" class="muse-chart-avg-label" text-anchor="end">avg ${percent(s.avg)}</text>
                <g class="muse-chart-hover" visibility="hidden"><line y1="${T}" y2="${T + ph}"/><circle r="5"/></g>
            </svg>
            <div class="sync-tip" hidden></div>`;
        box.geom = { pts, X, Y, L, pw, s0, span };
    }

    function sessionChartHover(event) {
        const box = sessionEl.chart, g = box.geom;
        if (!g) return;
        const r = box.getBoundingClientRect();
        const at = g.s0 + (event.clientX - r.left - g.L) / g.pw * g.span;
        const p = g.pts.reduce((best, q) => Math.abs(q.s - at) < Math.abs(best.s - at) ? q : best);
        const hover = box.querySelector('.muse-chart-hover'), tip = box.querySelector('.sync-tip');
        const x = g.X(p);
        hover.setAttribute('visibility', 'visible');
        hover.querySelector('line').setAttribute('x1', x);
        hover.querySelector('line').setAttribute('x2', x);
        hover.querySelector('circle').setAttribute('cx', x);
        hover.querySelector('circle').setAttribute('cy', g.Y(p.o));
        tip.hidden = false;
        tip.innerHTML = `<b>${percent(p.o)}</b> overall<br>Timing ${pct(p.t)} · Align ${pct(p.a)} · Energy ${pct(p.e)}<br>`
            + (p.v != null ? 'video ' + clock(p.v) : 'at ' + clock(p.s));
        tip.style.left = Math.min(Math.max(0, x - 90), r.width - 190) + 'px';
    }

    function sessionChartLeave() {
        sessionEl.chart.querySelector('.muse-chart-hover')?.setAttribute('visibility', 'hidden');
        const tip = sessionEl.chart.querySelector('.sync-tip');
        if (tip) tip.hidden = true;
    }

    /* body parts: one bar per part, weakest one marked (same markup as the Analyzer) */
    function renderSessionParts(s) {
        if (!Array.isArray(s.parts) || !s.parts.length) {
            sessionEl.parts.innerHTML = '<p class="sync-empty">No body-part data was saved for this session.</p>';
            return;
        }
        const parts = RADAR_PARTS.map(name => {
            const saved = s.parts.find(p => p.name === name);
            return { name, v: saved && typeof saved.v === 'number' ? saved.v : null };
        });
        const weakest = parts.filter(p => p.v != null).reduce((w, p) => (!w || p.v < w.v ? p : w), null);
        sessionEl.parts.innerHTML = parts.map(p => `
            <div class="sync-part${p === weakest && p.v < 0.8 ? ' weak' : ''}" title="${p.name}: ${p.v == null ? 'not visible' : percent(p.v)}">
                <span class="sync-part-name">${p.name}</span>
                <span class="sync-part-track"><span class="sync-part-fill" style="width:${p.v == null ? 0 : Math.round(p.v * 100)}%"></span></span>
                <span class="sync-part-val">${p.v == null ? '–' : percent(p.v)}</span>
            </div>`).join('');
    }

    /* the Analyzer's tips, worked out from what was saved with the session */
    function sessionTips(s) {
        const tips = [];
        const parts = (s.parts || []).filter(p => typeof p.v === 'number');
        const weakest = parts.reduce((w, p) => (!w || p.v < w.v ? p : w), null);
        if (weakest && weakest.v < 0.75)
            tips.push(`Your <b>${weakest.name}</b> matched the least (${percent(weakest.v)}). Watch only the dancer's ${weakest.name} for a few counts and copy its angle.`);
        if (s.timing < 0.8 && s.lag > 0.25)
            tips.push(`You were about <b>${s.lag.toFixed(1)}s behind</b> on average. Learn the moves at 0.5x in the Speed box, then speed up, and try to start each move a little earlier.`);
        if (s.energy < 0.75)
            tips.push(s.moves === 'smaller'
                ? 'Your moves were <b>smaller or softer</b> than the dancer\'s. Go bigger: stretch your arms fully and hit each move harder.'
                : s.moves === 'bigger'
                    ? 'You were <b>moving more</b> than the dancer. Keep the moves controlled and stop sharply where the dancer stops.'
                    : 'Your <b>energy</b> did not match the dancer\'s. Copy the size and sharpness of each move.');
        if (s.hardest && s.hardest.m < 0.75)
            tips.push(`Hardest part: <b>${clock(s.hardest.from)}–${clock(s.hardest.from + 5)}</b> of the video (${percent(s.hardest.m)}). Drag the timeline there on the Features page and loop it.`);
        if (!tips.length)
            tips.push(s.avg >= 0.85
                ? 'Great session! For a challenge, try 1.25x in the Speed box or turn off Mirror.'
                : 'Solid work. Keep practising this section until the score stays above 85%.');
        return tips;
    }

    if (sessionEl.select) {
        sessionEl.select.addEventListener('change', () => showSession(Number(sessionEl.select.value)));
        sessionEl.prev.addEventListener('click', () => showSession(shownIndex - 1));
        sessionEl.next.addEventListener('click', () => showSession(shownIndex + 1));
        sessionEl.chart.addEventListener('mousemove', sessionChartHover);
        sessionEl.chart.addEventListener('mouseleave', sessionChartLeave);
    }

    /* the SVG graphs are drawn at pixel size, so redraw them when their boxes change size */
    if (window.ResizeObserver) {
        const growthBox = document.getElementById('growth-graph-visual');
        if (growthBox) new ResizeObserver(() => renderGrowth(allSessions)).observe(growthBox);
        if (sessionEl.chart) new ResizeObserver(() => {
            if (allSessions[shownIndex]) renderSessionChart(allSessions[shownIndex]);
        }).observe(sessionEl.chart);
    }

    function renderStats() {
        const sessions = readSessions().sort((a, b) => a.date - b.date);
        allSessions = sessions;
        const totalSeconds = sessions.reduce((sum, s) => sum + (s.secs || 0), 0);
        setText('stat-sessions', sessions.length);
        setText('stat-learning-time', formatDuration(totalSeconds));
        renderWeek(sessions);
        renderGrowth(sessions);
        renderRadar(sessions);
        renderSessionHistory();

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