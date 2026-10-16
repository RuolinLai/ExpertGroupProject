/* "Ask MUSE AI" side panel on the profile page.
   Each message is sent to the MUSE server (server.js) together with the
   recent conversation and the user's stats from this browser, so the AI
   can answer with their real progress. */
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
    try { history = JSON.parse(sessionStorage.getItem(HISTORY_KEY)) || []; }
    catch (error) { history = []; }
    history.forEach(item => appendMessage(item.content, item.role === 'user' ? 'user' : 'ai'));

    toggleButton.addEventListener('click', () => panel.classList.toggle('open'));
    closeButton.addEventListener('click', () => panel.classList.remove('open'));

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
        try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (error) { }
    }

    function readJSON(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (error) { return fallback; }
    }

    const percent = value => typeof value === 'number' ? Math.round(value * 100) + '%' : null;

    // Gallery videos live in IndexedDB; only their details are sent, never the video files.
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
                overall: percent(session.avg),
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
