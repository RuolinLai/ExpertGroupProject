/* =========================================================
   1. "ASK MUSE AI" SIDE PANEL CHAT
   ========================================================= */
(function () {
    'use strict';

    const panel = document.getElementById('side-chat-panel');
    const form = document.getElementById('chat-form');
    if (!panel || !form) return;

    const toggleButton = document.getElementById('toggle-chat-btn');
    const closeButton = document.getElementById('close-chat-btn');
    const input = document.getElementById('user-input');
    const sendButton = document.getElementById('send-btn');
    const chatBox = document.getElementById('chat-box');
    const HISTORY_KEY = 'muse.chatHistory.v1';
    const MAX_HISTORY = 20;

    let history = [];
    try {
        history = JSON.parse(sessionStorage.getItem(HISTORY_KEY)) || [];
    } catch (error) {
        history = [];
    }
    history.forEach(item => appendMessage(item.content, item.role === 'user' ? 'user' : 'ai'));

    if (toggleButton) toggleButton.addEventListener('click', () => panel.classList.toggle('open'));
    if (closeButton) closeButton.addEventListener('click', () => panel.classList.remove('open'));

    function appendMessage(text, sender) {
        const message = document.createElement('div');
        message.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
        message.textContent = text;
        chatBox.appendChild(message);
        chatBox.scrollTop = chatBox.scrollHeight;
        return message;
    }

    function remember(role, content) {
        history.push({ role, content });
        history = history.slice(-MAX_HISTORY);
        try {
            sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch (error) { }
    }

    function readJSON(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key)) ?? fallback;
        } catch (error) {
            return fallback;
        }
    }

    const percent = value => typeof value === 'number' ? Math.round(value > 1 ? value : value * 100) + '%' : null;

    function readGallery() {
        return new Promise(resolve => {
            if (!window.indexedDB) return resolve([]);
            const request = indexedDB.open('MUSEGalleryDB', 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('videos')) {
                    request.result.createObjectStore('videos', { keyPath: 'id' });
                }
            };
            request.onerror = () => resolve([]);
            request.onsuccess = () => {
                const db = request.result;
                try {
                    const all = db.transaction('videos', 'readonly').objectStore('videos').getAll();
                    all.onsuccess = () => { resolve(all.result || []); db.close(); };
                    all.onerror = () => { resolve([]); db.close(); };
                } catch (error) { resolve([]); db.close(); }
            };
        });
    }

    async function collectStats() {
        const profile = readJSON('muse.profile.v1', {});
        const streak = window.MUSE?.streak?.get?.() || readJSON('muse.visitStreak.v1', null);
        const syncSessions = readJSON('muse.syncHistory', []);
        const videos = await readGallery();
        return {
            username: profile.username || 'MUSE Dancer',
            visitStreak: streak ? { days: streak.count, lastVisit: streak.lastDate } : null,
            savedSyncSessions: syncSessions.slice(-30).map(session => ({
                date: new Date(session.date).toLocaleString(),
                overall: percent(session.avg || session.overall),
                timing: percent(session.timing),
                align: percent(session.align),
                energy: percent(session.energy),
                seconds: Math.round(session.secs || 0)
            })),
            galleryVideos: videos.map(video => ({
                title: video.title,
                category: video.category || 'none',
                description: video.description || '',
                progress: video.progress + '%',
                favourite: !!video.favourite,
                added: video.dateAdded
            })).slice(-30)
        };
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const message = input.value.trim();
        if (!message) return;

        appendMessage(message, 'user');
        input.value = '';
        sendButton.disabled = true;
        const thinking = appendMessage('Thinking...', 'ai');

        try {
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, history, stats: await collectStats() })
            });
            const data = await response.json();
            thinking.textContent = data.reply || 'Sorry, something went wrong.';
            if (response.ok) {
                remember('user', message);
                remember('assistant', data.reply);
            }
        } catch (error) {
            thinking.textContent = 'Error reaching server. Is server.js running? (npm start)';
        } finally {
            sendButton.disabled = false;
            input.focus();
        }
    });
})();


/* =========================================================
   2. DASHBOARD VISUALIZATIONS & TAB PERSISTENCE CONNECTIONS
   ========================================================= */

// Helper: Safely converts decimal values (0.88) or numbers into integers (88)
function parseScore(val, fallback = 0) {
    if (val === undefined || val === null || isNaN(parseFloat(val))) return fallback;
    let num = parseFloat(val);
    return num <= 1 && num > 0 ? Math.round(num * 100) : Math.round(num);
}

// Global state restoration function
function loadStoredDashboardData() {
    try {
        const syncHistory = JSON.parse(localStorage.getItem('muse.syncHistory')) ||
            JSON.parse(localStorage.getItem('muse.sessions')) || [];
        if (syncHistory.length > 0) {
            const latestSession = syncHistory[syncHistory.length - 1];
            updateDashboardStats(latestSession);
        }
    } catch (e) {
        console.warn('Could not auto-load session stats from storage:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    /* Initial Load from Storage */
    loadStoredDashboardData();
});

/* Automatically re-sync and restore data when switching back to this tab */
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        loadStoredDashboardData();
    }
});

window.addEventListener('focus', () => {
    loadStoredDashboardData();
});


/* ---------------------------------------------
   SVG User Growth Line Graph Generator
--------------------------------------------- */
function renderGrowthSvg(historyScores) {
    const growthVisual = document.getElementById('growth-graph-visual');
    if (!growthVisual) return;

    if (!Array.isArray(historyScores) || historyScores.length === 0) {
        growthVisual.innerHTML = `<span class="muse-graph-empty">No session data recorded yet.</span>`;
        return;
    }

    const width = 320;
    const height = 110;
    const paddingLeft = 24;
    const paddingRight = 16;
    const paddingTop = 20;
    const paddingBottom = 20;
    const pointsCount = historyScores.length;

    // Calculate (x, y) plot coordinates
    const points = historyScores.map((score, index) => {
        const x = pointsCount === 1 
            ? (width - paddingLeft - paddingRight) / 2 + paddingLeft 
            : paddingLeft + (index / (pointsCount - 1)) * (width - paddingLeft - paddingRight);
        
        const normalizedScore = parseScore(score);
        const y = height - paddingBottom - (normalizedScore / 100) * (height - paddingTop - paddingBottom);
        return { x, y, score: normalizedScore, sessionIndex: index + 1 };
    });

    // Straight polyline connecting coordinates
    const linePathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

    const lastPoint = points[points.length - 1];
    const areaPathD = `${linePathD} L ${lastPoint.x},${height - paddingBottom} L ${points[0].x},${height - paddingBottom} Z`;

    // Render structured graph layout with background axis lines, data points, and value labels
    growthVisual.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" class="muse-line-svg" style="width: 100%; height: 100%; overflow: visible;">
            <defs>
                <linearGradient id="museAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#c4b0ff" stop-opacity="0.25"/>
                    <stop offset="100%" stop-color="#c4b0ff" stop-opacity="0.0"/>
                </linearGradient>
            </defs>

            <!-- Horizontal Axis Grid Lines -->
            <line x1="${paddingLeft}" y1="${paddingTop}" x2="${width - paddingRight}" y2="${paddingTop}" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" stroke-dasharray="3,3" />
            <line x1="${paddingLeft}" y1="${(height - paddingTop - paddingBottom) / 2 + paddingTop}" x2="${width - paddingRight}" y2="${(height - paddingTop - paddingBottom) / 2 + paddingTop}" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" stroke-dasharray="3,3" />
            <line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1" />

            <!-- Area Fill Under Line -->
            <path class="muse-line-area" d="${areaPathD}" fill="url(#museAreaGradient)" />

            <!-- Connecting Data Trend Lines -->
            <path class="muse-line" d="${linePathD}" fill="none" stroke="#c4b0ff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>

            <!-- Vertical Guides, Data Points & Interactive Tooltip Values -->
            ${points.map(pt => `
                <g class="muse-graph-point-group">
                    <line x1="${pt.x}" y1="${pt.y}" x2="${pt.x}" y2="${height - paddingBottom}" stroke="rgba(196, 176, 255, 0.2)" stroke-width="1" stroke-dasharray="2,2"/>
                    <circle cx="${pt.x}" cy="${pt.y}" r="4" fill="#ff7ebb" stroke="#120e18" stroke-width="1.8"/>
                    
                    <!-- Value Display Label above point -->
                    <text x="${pt.x}" y="${pt.y - 7}" text-anchor="middle" fill="#c4b0ff" font-size="9" font-weight="600" font-family="sans-serif">${pt.score}%</text>
                    
                    <!-- X-Axis Session Label below point -->
                    <text x="${pt.x}" y="${height - 5}" text-anchor="middle" fill="rgba(255, 255, 255, 0.45)" font-size="8" font-family="sans-serif">S${pt.sessionIndex}</text>
                </g>
            `).join('')}
        </svg>
    `;
}


/* ---------------------------------------------
   Main Exported Function to Update Dashboard Stats
--------------------------------------------- */
function updateDashboardStats(session) {
    if (!session) return;

    // 1. Parse scores with safe defaults
    const timing = parseScore(session.timing, 85);
    const align = parseScore(session.align || session.alignment, 85);
    const energy = parseScore(session.energy, 85);
    const pitch = parseScore(session.pitch, Math.round((timing + align) / 2));
    const consistency = parseScore(session.consistency, Math.round((timing + align + energy) / 3));

    // 2. Update Skill Radar (Spider Chart)
    if (window.skillRadarChart) {
        window.skillRadarChart.data.datasets[0].data = [timing, align, energy, pitch, consistency];
        window.skillRadarChart.update();
    }

    // 3. Update Progress Bars & Values
    const updateBar = (barId, valId, score) => {
        const bar = document.getElementById(barId);
        const val = document.getElementById(valId);
        if (bar) bar.style.width = `${score}%`;
        if (val) val.textContent = `${score}%`;
    };

    updateBar('bar-timing', 'val-timing', timing);
    updateBar('bar-align', 'val-align', align);
    updateBar('bar-energy', 'val-energy', energy);

    // 4. Update Quick Overview Cards
    const syncHistory = JSON.parse(localStorage.getItem('muse.syncHistory')) ||
        JSON.parse(localStorage.getItem('muse.sessions')) || [];

    const historyScores = syncHistory.map(s => parseScore(s.avg || s.overall || s.timing || 80));
    if (session && historyScores.length === 0) {
        historyScores.push(parseScore(session.avg || session.overall || Math.round((timing + align + energy) / 3)));
    }

    const accuracyEl = document.getElementById('stat-accuracy');
    if (accuracyEl && historyScores.length > 0) {
        const sum = historyScores.reduce((acc, curr) => acc + curr, 0);
        const overallAvg = Math.round(sum / historyScores.length);
        accuracyEl.textContent = `${overallAvg}%`;
    }

    const sessionsEl = document.getElementById('stat-sessions');
    if (sessionsEl) {
        sessionsEl.textContent = syncHistory.length || (session ? 1 : 0);
    }

    const bestEl = document.getElementById('stat-best');
    if (bestEl && historyScores.length > 0) {
        const maxScore = Math.max(...historyScores);
        bestEl.textContent = `${maxScore}%`;
    }

    const timeEl = document.getElementById('stat-learning-time');
    if (timeEl && syncHistory.length > 0) {
        const totalSecs = syncHistory.reduce((acc, curr) => acc + (curr.secs || 60), 0);
        const totalMins = Math.round(totalSecs / 60);
        timeEl.textContent = `${totalMins} min`;
    }

    // 5. Update Growth Graph & Badge
    const growthSummary = document.getElementById('growth-summary');

    if (syncHistory.length > 0) {
        if (growthSummary) {
            const latestAvg = parseScore(syncHistory[syncHistory.length - 1].avg || syncHistory[syncHistory.length - 1].overall, 88);
            growthSummary.textContent = `Avg Score: ${latestAvg}% (${syncHistory.length} Sessions)`;
        }
        renderGrowthSvg(historyScores);
    } else {
        if (growthSummary) growthSummary.textContent = `1 Session Analyzed ✦`;
        renderGrowthSvg([parseScore(session.avg || session.overall || 88)]);
    }
}

// Global binding
window.updateDashboardStats = updateDashboardStats;