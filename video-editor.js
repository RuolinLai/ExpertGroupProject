/* =========================================================
   PRACTICE VIDEO EDITOR
   Every control of the "Practice Video Editor" card lives in this
   file: local file playback, YouTube / TikTok / Instagram links,
   the custom player bar, the playback-speed slider and Mirror.

   The whole file is wrapped in an IIFE so it keeps its own scope
   and cannot clash with the globals declared in script.js.
   Other modules (camera.js) read the player state through the
   small read-only API published on window.MUSE.videoEditor.

   Mirror flips ONLY #videoStage. The control bar sits outside it,
   so its buttons and text are never reversed.
   ========================================================= */
(function () {
    'use strict';

    /* ---------- Element lookups ---------- */
    const video = document.getElementById('danceVideo');
    const videoFrame = document.getElementById('videoFrame');
    const videoStage = document.getElementById('videoStage');
    const embedStage = document.getElementById('embedStage');
    const clickShield = document.getElementById('clickShield');

    const mirrorBtn = document.getElementById('mirrorBtn');
    const speedCtrl = document.getElementById('speedCtrl');
    const speedRange = document.getElementById('speedRange');
    const speedVal = document.getElementById('speedVal');

    const playerBar = document.getElementById('playerBar');
    const pbPlay = document.getElementById('pbPlay');
    const pbTime = document.getElementById('pbTime');
    const pbSeek = document.getElementById('pbSeek');
    const pbMute = document.getElementById('pbMute');
    const pbVol = document.getElementById('pbVol');
    const pbFull = document.getElementById('pbFull');

    const linkForm = document.getElementById('linkForm');
    const linkInput = document.getElementById('videoLinkInput');
    const linkStatus = document.getElementById('linkStatus');
    const uploadInput = document.getElementById('videoUpload');
    const uploadName = document.getElementById('uploadName');
    const uploadZone = document.getElementById('uploadZone');

    /* ---------- Glyphs used by the control bar ---------- */
    const ICON_PLAY = '▶';         // ▶
    const ICON_PAUSE = '❚❚';  // ❚❚
    const ICON_SOUND_ON = '🔊';
    const ICON_SOUND_OFF = '🔇';

    /* ---------- State ---------- */
    const LINK_HINT = 'YouTube: play, pause, seek and speed all work. TikTok & Instagram: use their own player controls; Mirror still works.';
    // YouTube only accepts these discrete rates, so slider values are snapped to them.
    const YT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

    let mode = 'file';          // 'file' | 'youtube' | 'embed' (TikTok / Instagram)
    let ytPlayer = null;
    let ytApiPromise = null;
    let savedEmbedSrc = null;
    let currentRate = 1;
    let mirrored = false;
    let pbMuted = false;
    let pbSeeking = false;
    let currentVideoURL = null;  // object URL of the uploaded file, so it can be revoked

    /* =========================================================
       PLAY / PAUSE
       Driven by the player bar's toggle button, the click shield and a
       click on the picture itself - there are no separate Play / Pause
       buttons in the control row.
       ========================================================= */
    function play() {
        if (mode === 'youtube') ytPlayer?.playVideo();
        else video?.play().catch(() => { });
    }

    function pause() {
        if (mode === 'youtube') ytPlayer?.pauseVideo();
        else video?.pause();
    }

    function isPlayingNow() {
        if (mode === 'youtube') return ytPlayer?.getPlayerState?.() === 1;
        return !!video && !video.paused && !video.ended;
    }

    function togglePlay() {
        if (isPlayingNow()) pause(); else play();
        setTimeout(updatePlayIcon, 50);
    }

    /* =========================================================
       PLAYBACK SPEED (slider)
       Replaces the old fixed 0.5x / Normal / 1.5x buttons, so any
       speed between 0.25x and 2x can be picked for tricky footwork.
       ========================================================= */
    function snapToYouTubeRate(rate) {
        return YT_RATES.reduce((best, r) =>
            Math.abs(r - rate) < Math.abs(best - rate) ? r : best, YT_RATES[0]);
    }

    function setRate(rate) {
        currentRate = Math.min(2, Math.max(0.25, Number(rate) || 1));
        if (video) video.playbackRate = currentRate;
        if (mode === 'youtube') ytPlayer?.setPlaybackRate?.(snapToYouTubeRate(currentRate));
        if (speedRange && Number(speedRange.value) !== currentRate) speedRange.value = currentRate;
        if (speedVal) speedVal.textContent = currentRate.toFixed(2) + 'x';
    }

    speedRange?.addEventListener('input', () => setRate(speedRange.value));
    // Double-click anywhere on the control snaps straight back to normal speed.
    speedCtrl?.addEventListener('dblclick', () => setRate(1));

    /* =========================================================
       MIRROR (picture only, never the controls)
       ========================================================= */
    // flips the picture and the skeleton drawn on it (style.css: .is-mirrored), never the controls
    function applyMirror() {
        videoFrame?.classList.toggle('is-mirrored', mirrored);
        mirrorBtn?.classList.toggle('active-btn', mirrored);
    }

    mirrorBtn?.addEventListener('click', () => {
        mirrored = !mirrored;
        applyMirror();
    });

    /* =========================================================
       CUSTOM CONTROL BAR
       ========================================================= */
    function fmtTime(sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
        return m + ':' + String(s).padStart(2, '0');
    }

    function updatePlayIcon() {
        if (!pbPlay) return;
        const playing = isPlayingNow();
        pbPlay.textContent = playing ? ICON_PAUSE : ICON_PLAY;
        pbPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }

    function getTimes() {
        if (mode === 'youtube' && ytPlayer?.getCurrentTime) {
            return { cur: ytPlayer.getCurrentTime() || 0, dur: ytPlayer.getDuration() || 0 };
        }
        return { cur: video?.currentTime || 0, dur: video?.duration || 0 };
    }

    function updateProgress() {
        if (mode === 'embed' || !pbSeek) return;
        const { cur, dur } = getTimes();
        if (!pbSeeking) pbSeek.value = dur ? Math.round(cur / dur * 1000) : 0;
        if (pbTime) {
            pbTime.textContent = fmtTime(pbSeeking ? (pbSeek.value / 1000) * dur : cur) + ' / ' + fmtTime(dur);
        }
        updatePlayIcon();
    }

    function syncPlayerUI() {
        if (playerBar) playerBar.hidden = (mode === 'embed');
        if (replayBtn) replayBtn.hidden = (mode !== 'embed');
        if (clickShield) clickShield.hidden = (mode !== 'youtube');
        updatePlayIcon();
        // let pose-sync.js know whether we are showing a local file or a link
        document.dispatchEvent(new CustomEvent('muse:videomode', { detail: { mode } }));
    }

    pbPlay?.addEventListener('click', togglePlay);
    clickShield?.addEventListener('click', togglePlay);
    video?.addEventListener('click', togglePlay);

    /* Replay (TikTok / Instagram): Instagram only plays a reel once ("Watch again on Instagram"),
       and its player can't be controlled from our page, so reload the embed to start it over */
    const replayBtn = document.getElementById('replayBtn');
    replayBtn?.addEventListener('click', () => {
        const f = embedStage?.querySelector('iframe');
        if (f && f.src !== 'about:blank') { const src = f.src; f.src = 'about:blank'; f.src = src; }
    });

    /* =========================================================
       FRAME SIZE
       The video frame takes the video's shape, and the camera box is as
       tall as the video box, lined up with it, so you can watch both at once.
       ========================================================= */
    /* Keep --nav-h equal to the sticky navbar's height, so the video can fill the window below it */
    const siteHeader = document.querySelector('header');
    if (siteHeader) {
        const setNavH = () => document.documentElement.style.setProperty('--nav-h', siteHeader.offsetHeight + 'px');
        setNavH();
        if ('ResizeObserver' in window) new ResizeObserver(setNavH).observe(siteHeader);
        else addEventListener('resize', setNavH);
    }

    const camFrame = document.getElementById('camFrame');
    function syncCamFrame() {
        if (!videoFrame || !camFrame) return;
        const shown = mode === 'file' ? videoFrame : embedStage;   // a tall embed is narrower/taller than the frame
        const h = (mode === 'file' ? videoFrame.offsetHeight - 52 : shown.offsetHeight);   // 52px = control bar
        camFrame.parentElement.style.setProperty('--cam-h', Math.max(240, h) + 'px');
        const editor = videoFrame.closest('article'), cam = camFrame.closest('article');
        const sideBySide = cam.getBoundingClientRect().left > editor.getBoundingClientRect().left + 10;
        camFrame.style.marginTop = '';
        if (sideBySide) {
            const gap = (videoFrame.getBoundingClientRect().top - editor.getBoundingClientRect().top)
                      - (camFrame.getBoundingClientRect().top - cam.getBoundingClientRect().top);
            if (gap > 0) camFrame.style.marginTop = gap + 'px';
        }
    }
    if (videoFrame && camFrame && 'ResizeObserver' in window) {
        const ro = new ResizeObserver(syncCamFrame);
        [videoFrame, embedStage, camFrame.closest('article')].forEach(el => el && ro.observe(el));
    }
    addEventListener('resize', syncCamFrame);

    /* Shape the frame like the video (null = tall embed, which has its own fixed size) */
    const danceTop = videoFrame?.closest('.dance-top');
    function fitFrame(ratio) {
        if (!videoFrame || !danceTop) return;
        videoFrame.classList.toggle('tall-embed', ratio === null);
        danceTop.classList.toggle('tall-embed', ratio === null);
        danceTop.classList.toggle('portrait', ratio === null || ratio < 1);
        if (ratio) danceTop.style.setProperty('--vid-ar', ratio);
    }
    video?.addEventListener('loadedmetadata', () => {
        if (mode === 'file' && video.videoWidth) fitFrame(video.videoWidth / video.videoHeight);
    });

    // A local <video> fires its own events; only YouTube needs polling.
    ['play', 'pause', 'ended', 'loadedmetadata', 'timeupdate', 'durationchange']
        .forEach(ev => video?.addEventListener(ev, updateProgress));
    setInterval(() => { if (mode === 'youtube') updateProgress(); }, 250);

    pbSeek?.addEventListener('input', () => { pbSeeking = true; updateProgress(); });
    pbSeek?.addEventListener('change', () => {
        const { dur } = getTimes();
        const t = (pbSeek.value / 1000) * dur;
        if (mode === 'youtube') ytPlayer?.seekTo?.(t, true);
        else if (video) video.currentTime = t;
        pbSeeking = false;
        updateProgress();
    });

    function applyVolume() {
        const v = parseFloat(pbVol?.value ?? '1');
        if (video) { video.volume = v; video.muted = pbMuted; }
        if (mode === 'youtube' && ytPlayer?.setVolume) {
            ytPlayer.setVolume(Math.round(v * 100));
            if (pbMuted) ytPlayer.mute(); else ytPlayer.unMute();
        }
        if (pbMute) pbMute.textContent = (pbMuted || v === 0) ? ICON_SOUND_OFF : ICON_SOUND_ON;
    }

    pbVol?.addEventListener('input', () => {
        if (parseFloat(pbVol.value) > 0) pbMuted = false;
        applyVolume();
    });
    pbMute?.addEventListener('click', () => { pbMuted = !pbMuted; applyVolume(); });

    pbFull?.addEventListener('click', () => {
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
        const req = videoFrame?.requestFullscreen || videoFrame?.webkitRequestFullscreen;
        if (req) req.call(videoFrame);
        else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();   // iPhone Safari fallback
    });

    /* =========================================================
       PLAY A VIDEO FROM A YOUTUBE / TIKTOK / INSTAGRAM LINK
       ========================================================= */
    function setLinkStatus(msg, isError) {
        if (!linkStatus) return;
        linkStatus.textContent = msg;
        linkStatus.classList.toggle('error', !!isError);
    }

    // TikTok / Instagram run in their own iframe, so our transport cannot drive them.
    function setTransportEnabled(on) {
        if (speedRange) speedRange.disabled = !on;
        speedCtrl?.setAttribute('aria-disabled', String(!on));
    }

    /* Work out which site a link is from and get its video id */
    function parseVideoLink(raw) {
        let u;
        try { u = new URL(raw.trim()); }
        catch { try { u = new URL('https://' + raw.trim()); } catch { return null; } }

        const host = u.hostname.replace(/^(www\.|m\.)/, '');
        const parts = u.pathname.split('/').filter(Boolean);

        if (host === 'youtu.be' && parts[0]) {
            return { type: 'youtube', id: parts[0] };
        }
        if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
            let id = u.searchParams.get('v');
            if (!id && ['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1];
            if (id) return { type: 'youtube', id, vertical: parts[0] === 'shorts' };
        }
        if (host.endsWith('tiktok.com')) {
            const i = parts.indexOf('video');
            if (i > -1 && /^\d+$/.test(parts[i + 1] || '')) return { type: 'tiktok', id: parts[i + 1] };
            return { type: 'tiktok-short' };
        }
        if (host === 'instagram.com') {
            const i = parts.findIndex(p => ['p', 'reel', 'reels', 'tv'].includes(p));
            if (i > -1 && parts[i + 1]) {
                return { type: 'instagram', id: parts[i + 1], kind: (parts[i] === 'reel' || parts[i] === 'reels') ? 'reel' : 'p' };
            }
        }
        return null;
    }

    function destroyEmbed() {
        if (ytPlayer) { try { ytPlayer.destroy(); } catch (e) { } ytPlayer = null; }
        embedStage?.replaceChildren();
        savedEmbedSrc = null;
    }

    function showEmbedMode(newMode, vertical) {
        mode = newMode;
        video?.pause();
        if (video) video.style.display = 'none';
        if (embedStage) {
            embedStage.hidden = false;
            embedStage.className = 'embed-stage ' + (vertical ? 'tall' : 'wide');
        }
        fitFrame(vertical ? null : 16 / 9);
        setTransportEnabled(newMode === 'youtube');
        applyMirror();
        syncPlayerUI();
    }

    /* Go back to the normal <video> (used when a file is uploaded) */
    function showFileMode() {
        if (mode === 'file') return;
        destroyEmbed();
        mode = 'file';
        if (embedStage) embedStage.hidden = true;
        if (video) video.style.display = '';
        fitFrame(video?.videoWidth ? video.videoWidth / video.videoHeight : 16 / 9);
        setTransportEnabled(true);
        applyMirror();
        syncPlayerUI();
        setLinkStatus(LINK_HINT, false);
    }

    function loadYouTubeApi() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        if (!ytApiPromise) {
            ytApiPromise = new Promise((resolve, reject) => {
                const prev = window.onYouTubeIframeAPIReady;
                window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
                const s = document.createElement('script');
                s.src = 'https://www.youtube.com/iframe_api';
                s.onerror = () => { ytApiPromise = null; reject(new Error('Could not load the YouTube player. Check your connection.')); };
                document.head.appendChild(s);
            });
        }
        return ytApiPromise;
    }

    function youTubeErrorMessage(code) {
        if (code === 153) {
            return location.protocol === 'file:'
                ? 'YouTube error 153: this page was opened as a local file (file://), so YouTube can’t verify where it is embedded. Run it from a local server (http://localhost) or upload it to a website, then try again.'
                : 'YouTube error 153: YouTube did not receive a valid referrer from this page. Check that no browser extension or Referrer-Policy header is stripping it.';
        }
        if (code === 101 || code === 150) return 'The owner of this YouTube video has turned off embedding. Try another video.';
        if (code === 100) return 'This YouTube video was not found or is private.';
        if (code === 2) return 'That YouTube link has an invalid video id.';
        return 'This YouTube video can’t be played here (it may be private or embedding is turned off).';
    }

    async function loadYouTube(id, vertical) {
        await loadYouTubeApi();
        destroyEmbed();
        const holder = document.createElement('div');
        embedStage.appendChild(holder);
        showEmbedMode('youtube', vertical);
        ytPlayer = new YT.Player(holder, {
            videoId: id,
            // controls:0 hides YouTube's own UI so nothing in it gets mirrored; we use our own bar.
            playerVars: Object.assign({
                playsinline: 1, rel: 0,
                controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1
            }, /^https?:$/.test(location.protocol) ? { origin: location.origin } : {}),
            events: {
                onReady: e => {
                    e.target.setPlaybackRate(snapToYouTubeRate(currentRate));
                    e.target.setVolume(Math.round(parseFloat(pbVol?.value ?? '1') * 100));
                    if (pbMuted) e.target.mute();
                },
                onStateChange: updatePlayIcon,
                onError: e => setLinkStatus(youTubeErrorMessage(e && e.data), true)
            }
        });
    }

    function loadIframe(src) {
        destroyEmbed();
        const f = document.createElement('iframe');
        f.src = src;
        f.title = 'Embedded dance video';
        f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
        f.allowFullscreen = true;
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        embedStage.appendChild(f);
        showEmbedMode('embed', true);
    }

    /* The TikTok player tells us (postMessage) when a video can't be played; without this a failure is just a black box */
    window.addEventListener('message', e => {
        let host = '';
        try { host = new URL(e.origin).hostname; } catch { return; }
        if (!/(^|\.)tiktok\.com$/.test(host)) return;
        let d = e.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
        if (!d || !d['x-tiktok-player']) return;
        if (d.type === 'onPlayerError') {
            const code = d.value && d.value.errorCode;
            setLinkStatus(code === 1001 ? 'TikTok can’t find this video (it may be deleted or private).'
                : code === 3002 ? 'Press play in the TikTok player to start the video.'
                : 'TikTok could not play this video (error ' + (code || '?') + '). Try again or try another video.', code !== 3002);
        }
    });

    linkForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const raw = linkInput.value.trim();
        if (!raw) { setLinkStatus('Paste a YouTube, TikTok or Instagram link first.', true); return; }

        const info = parseVideoLink(raw);
        if (!info) { setLinkStatus('That link isn’t a YouTube, TikTok or Instagram video link.', true); return; }

        try {
            if (info.type === 'youtube') {
                if (!/^[\w-]{11}$/.test(info.id)) { setLinkStatus('That YouTube link looks incomplete.', true); return; }
                setLinkStatus('Loading YouTube video…', false);
                await loadYouTube(info.id, info.vertical);
                setLinkStatus('Now learning from YouTube. ' + LINK_HINT, false);
            } else if (info.type === 'tiktok') {
                // TikTok's current embed player (the old /embed/v2/ page often stays black); loop=1 replays it
                loadIframe('https://www.tiktok.com/player/v1/' + info.id + '?loop=1&rel=0&music_info=0&description=0');
                setLinkStatus('Now learning from TikTok. It loops by itself; use the player’s own controls. Mirror still works.', false);
            } else if (info.type === 'tiktok-short') {
                setLinkStatus('Short TikTok links (vm.tiktok.com) can’t be read. Open it in your browser and copy the full link that contains /video/.', true);
            } else if (info.type === 'instagram') {
                loadIframe('https://www.instagram.com/' + info.kind + '/' + info.id + '/embed');
                setLinkStatus('Now learning from Instagram. Use the player’s own controls; when it ends, press Replay to watch it again here. Mirror still works.', false);
            }
        } catch (err) {
            setLinkStatus(err.message || 'Could not load that video.', true);
        }
    });

    /* =========================================================
       UPLOAD YOUR OWN DANCE VIDEO
       ========================================================= */
    function loadUploadedVideo(file) {
        if (!file || !file.type.startsWith('video/')) {
            if (uploadName) uploadName.textContent = 'Please choose a video file.';
            return;
        }
        if (currentVideoURL) URL.revokeObjectURL(currentVideoURL);
        showFileMode();                   // leave YouTube/TikTok/Instagram mode if active
        currentVideoURL = URL.createObjectURL(file);
        video.src = currentVideoURL;      // replaces the <source> element
        video.load();
        video.play().catch(() => { });
        if (uploadName) uploadName.textContent = 'Now learning: ' + file.name;
    }

    uploadInput?.addEventListener('change', e => loadUploadedVideo(e.target.files[0]));
    ['dragenter', 'dragover'].forEach(t => uploadZone?.addEventListener(t, e => {
        e.preventDefault(); uploadZone.classList.add('drag');
    }));
    ['dragleave', 'drop'].forEach(t => uploadZone?.addEventListener(t, e => {
        e.preventDefault(); uploadZone.classList.remove('drag');
    }));
    uploadZone?.addEventListener('drop', e => loadUploadedVideo(e.dataTransfer.files[0]));

    // Loading a new source resets playbackRate, so re-apply the slider value.
    video?.addEventListener('loadedmetadata', () => { video.playbackRate = currentRate; });

    /* =========================================================
       LEAVING / RE-ENTERING THE DANCE PAGE
       Leaving stops the sound; coming back restores the embed.
       ========================================================= */
    function suspendEmbed() {
        document.dispatchEvent(new CustomEvent('muse:leave'));   // stops skeleton analysis / screen capture
        if (mode === 'youtube') { try { ytPlayer?.pauseVideo(); } catch (e) { } }
        if (mode === 'embed') {
            const f = embedStage?.querySelector('iframe');
            if (f && f.src !== 'about:blank') { savedEmbedSrc = f.src; f.src = 'about:blank'; }
        }
        if (mode === 'file') video?.pause();
    }

    function resumeEmbed() {
        if (mode === 'embed' && savedEmbedSrc) {
            const f = embedStage?.querySelector('iframe');
            if (f) f.src = savedEmbedSrc;
            savedEmbedSrc = null;
        }
    }

    document.querySelectorAll('.nav-link:not(#dance-nav-link), .nav-logo')
        .forEach(el => el.addEventListener('click', suspendEmbed));
    document.getElementById('dance-nav-link')?.addEventListener('click', resumeEmbed);
    document.querySelector('.card-float.f1 a')?.addEventListener('click', resumeEmbed);

    /* =========================================================
       PUBLIC API
       camera.js needs the reference <video> (and whether it is
       mirrored) to compare the learner's pose against it.
       ========================================================= */
    window.MUSE = window.MUSE || {};
    window.MUSE.videoEditor = {
        getMode: () => mode,
        isMirrored: () => mirrored,
        isPlaying: isPlayingNow,
        getRate: () => currentRate,
        /* The <video> element, but only when its pixels can actually be
           read. YouTube / TikTok / Instagram run cross-origin inside an
           iframe, so no pose can be extracted and this returns null. */
        getReferenceVideo: () =>
            (mode === 'file' && video && video.readyState >= 2 && video.videoWidth > 0) ? video : null
    };

    /* If the MediaPipe library could not load (slow network, blocked CDN, ad-blocker), say so
       instead of the Skeleton button silently doing nothing. */
    document.getElementById('vidSkelBtn')?.addEventListener('click', () => {
        if (window.__museMediaPipeReady) return;
        const st = document.getElementById('vidPoseStatus');
        if (!st) return;
        st.textContent = 'The MediaPipe library has not loaded yet (slow network, a blocked cdn.jsdelivr.net, or an ad-blocker/VPN issue). Wait a moment, or check your connection and refresh with Ctrl+Shift+R.';
        st.classList.add('error');
    });

    /* ---------- Initial state ---------- */
    setRate(speedRange ? speedRange.value : 1);
    applyVolume();
    applyMirror();
    syncPlayerUI();
})();
