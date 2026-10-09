// Cards drift toward the mouse and tilt when the pointer is nearby
const cards = document.querySelectorAll('[data-card]');
const RANGE = 380;   // how far from a card the pointer still affects it (px)
const MOVE = 22;     // max drift distance (px)
const TILT = 12;     // max tilt (deg)
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


const state = [...cards].map(el => ({ el, x: 0, y: 0, rx: 0, ry: 0, tx: 0, ty: 0, trx: 0, try_: 0 }));
let mouse = null;


window.addEventListener('mousemove', e => { mouse = { x: e.clientX, y: e.clientY }; });
window.addEventListener('mouseleave', () => { mouse = null; });


function tick() {
  state.forEach(s => {
    s.tx = s.ty = s.trx = s.try_ = 0;
    if (mouse && !reduce && window.innerWidth > 800) {
      const r = s.el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = mouse.x - cx, dy = mouse.y - cy;
      const dist = Math.hypot(dx, dy);
      const power = Math.max(0, 1 - dist / RANGE);          // 0 far away, 1 on top
      const nx = Math.max(-1, Math.min(1, dx / (r.width / 2)));
      const ny = Math.max(-1, Math.min(1, dy / (r.height / 2)));
      s.tx = (dx / (dist || 1)) * MOVE * power;
      s.ty = (dy / (dist || 1)) * MOVE * power;
      s.trx = -ny * TILT * power;
      s.try_ = nx * TILT * power;
      // light spot that follows the cursor on the glass
      s.el.style.setProperty('--mx', ((mouse.x - r.left) / r.width * 100) + '%');
      s.el.style.setProperty('--my', ((mouse.y - r.top) / r.height * 100) + '%');
      s.el.style.setProperty('--glow', power.toFixed(2));
    } else {
      s.el.style.setProperty('--glow', 0);
    }
    // smooth easing toward the target
    s.x += (s.tx - s.x) * 0.1;  s.y += (s.ty - s.y) * 0.1;
    s.rx += (s.trx - s.rx) * 0.1; s.ry += (s.try_ - s.ry) * 0.1;
    s.el.style.transform =
      `translate3d(${s.x}px, ${s.y}px, 0) perspective(800px) rotateX(${s.rx}deg) rotateY(${s.ry}deg)`;
  });
  requestAnimationFrame(tick);
}
tick();


// Scroll reveal for every .reveal element
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));


// Duplicate the review cards so the marquee loops seamlessly
const track = document.getElementById('track');
if (track) {
  [...track.children].forEach(c => {
    const clone = c.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
  });
}


// Screenshot frames tilt slightly under the pointer
document.querySelectorAll('.shot').forEach(el => {
  el.addEventListener('mousemove', e => {
    if (reduce) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--tx', (x * 8) + 'deg');
    el.style.setProperty('--ty', (-y * 8) + 'deg');
  });
  el.addEventListener('mouseleave', () => { el.style.setProperty('--tx', '0deg'); el.style.setProperty('--ty', '0deg'); });
});


// Decorations shift slightly with the mouse (depth = how much)
const decos = document.querySelectorAll('.deco');
window.addEventListener('mousemove', e => {
  if (reduce || window.innerWidth <= 800) return;
  const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
  decos.forEach(d => {
    const k = +d.dataset.depth;
    d.style.translate = `${-nx * k}px ${-ny * k}px`;
  });
});


/* ================= PAGE SWITCHING & DANCE FEATURES ================= */
const homeContainer = document.getElementById('home-page-container');
const mainHero = document.querySelector('main.hero');
const pageSections = document.querySelector('.page-sections');
const danceContainer = document.getElementById('dance-page-container');


const danceNavLink = document.getElementById('dance-nav-link');
const danceCardBtn = document.querySelector('.card-float.f1 a');
const homeNavLinks = document.querySelectorAll('.nav-link:not(#dance-nav-link)');
const logoLink = document.querySelector('.nav-logo');


// Function to switch to Dance view
function openDanceView(e) {
    if (e) e.preventDefault();
    if (homeContainer) {
        homeContainer.style.display = 'none';
    } else {
        if (mainHero) mainHero.style.display = 'none';
        if (pageSections) pageSections.style.display = 'none';
    }
    if (danceContainer) danceContainer.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


// Function to switch back to Home view while preserving exact original layout
function openHomeView(e) {
    if (e) e.preventDefault();
    if (danceContainer) danceContainer.style.display = 'none';
   
    if (homeContainer) {
        homeContainer.style.display = '';
    } else {
        if (mainHero) mainHero.style.display = '';
        if (pageSections) pageSections.style.display = '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


// Attach listeners for switching to Dance Page
danceNavLink?.addEventListener('click', openDanceView);
danceCardBtn?.addEventListener('click', openDanceView);


// Attach listeners for switching back to Home Page
homeNavLinks.forEach(link => link.addEventListener('click', openHomeView));
logoLink?.addEventListener('click', openHomeView);


/* =========================================================
   VIDEO PLAYER: local file, YouTube, TikTok, Instagram
   Mirror flips ONLY #videoStage. The control bar is outside it,
   so its buttons and text are never reversed.
   ========================================================= */
let mode = 'file';        // 'file' | 'youtube' | 'embed' (TikTok / Instagram)
let ytPlayer = null;
let currentRate = 1;
let mirrored = false;
const video = document.getElementById('danceVideo');
const slowBtn = document.getElementById('slowBtn');
const normalBtn = document.getElementById('normalBtn');
const fastBtn = document.getElementById('fastBtn');
const mirrorBtn = document.getElementById('mirrorBtn');
const videoFrame = document.getElementById('videoFrame');
const videoStage = document.getElementById('videoStage');
const embedStage = document.getElementById('embedStage');
const clickShield = document.getElementById('clickShield');
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
const LINK_HINT = 'YouTube: play, pause, seek and speed all work. TikTok & Instagram: use their own player controls; Mirror still works.';
const transportIds = ['playBtn', 'pauseBtn', 'slowBtn', 'normalBtn', 'fastBtn'];
let pbMuted = false;
let pbSeeking = false;
let ytApiPromise = null;
let savedEmbedSrc = null;

/* ---------- Play / Pause / Speed buttons ---------- */
document.getElementById('playBtn')?.addEventListener('click', () => {
    if (mode === 'youtube') ytPlayer?.playVideo(); else video?.play();
});
document.getElementById('pauseBtn')?.addEventListener('click', () => {
    if (mode === 'youtube') ytPlayer?.pauseVideo(); else video?.pause();
});

function setRate(rate, btn) {
    if (video) video.playbackRate = rate;
    currentRate = rate;
    if (mode === 'youtube') ytPlayer?.setPlaybackRate?.(rate);
    [slowBtn, normalBtn, fastBtn].forEach(b => b?.classList.remove('active-btn'));
    btn?.classList.add('active-btn');
}
slowBtn?.addEventListener('click', () => setRate(0.5, slowBtn));
normalBtn?.addEventListener('click', () => setRate(1.0, normalBtn));
fastBtn?.addEventListener('click', () => setRate(1.5, fastBtn));

/* ---------- Mirror (picture only, never the controls) ---------- */
function applyMirror() {
    if (videoStage) videoStage.style.transform = mirrored ? 'scaleX(-1)' : 'scaleX(1)';
    mirrorBtn?.classList.toggle('active-btn', mirrored);
}
mirrorBtn?.addEventListener('click', () => {
    mirrored = !mirrored;
    applyMirror();
});

/* ---------- Our own control bar ---------- */
function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
}

function syncPlayerUI() {
    if (playerBar) playerBar.hidden = (mode === 'embed');
    if (clickShield) clickShield.hidden = (mode !== 'youtube');
    updatePlayIcon();
}

function isPlayingNow() {
    if (mode === 'youtube') return !!ytPlayer?.getPlayerState && ytPlayer.getPlayerState() === 1;
    return !!video && !video.paused && !video.ended;
}

function updatePlayIcon() {
    if (!pbPlay) return;
    const playing = isPlayingNow();
    pbPlay.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
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
    pbTime.textContent = fmtTime(pbSeeking ? (pbSeek.value / 1000) * dur : cur) + ' / ' + fmtTime(dur);
    updatePlayIcon();
}

function togglePlay() {
    if (mode === 'youtube') {
        if (isPlayingNow()) ytPlayer?.pauseVideo(); else ytPlayer?.playVideo();
    } else if (video) {
        if (video.paused) video.play().catch(() => {}); else video.pause();
    }
    setTimeout(updatePlayIcon, 50);
}

pbPlay?.addEventListener('click', togglePlay);
clickShield?.addEventListener('click', togglePlay);
video?.addEventListener('click', togglePlay);
['play', 'pause', 'ended', 'loadedmetadata', 'timeupdate', 'durationchange']
    .forEach(ev => video?.addEventListener(ev, updateProgress));
setInterval(updateProgress, 250);   // YouTube has no time events, so poll

pbSeek?.addEventListener('input', () => { pbSeeking = true; updateProgress(); });
pbSeek?.addEventListener('change', () => {
    const { dur } = getTimes();
    const t = (pbSeek.value / 1000) * dur;
    if (mode === 'youtube') ytPlayer?.seekTo?.(t, true); else if (video) video.currentTime = t;
    pbSeeking = false;
    updateProgress();
});

function applyVolume() {
    const v = parseFloat(pbVol.value);
    if (video) { video.volume = v; video.muted = pbMuted; }
    if (mode === 'youtube' && ytPlayer?.setVolume) {
        ytPlayer.setVolume(Math.round(v * 100));
        if (pbMuted) ytPlayer.mute(); else ytPlayer.unMute();
    }
    pbMute.innerHTML = (pbMuted || v === 0) ? '&#128263;' : '&#128266;';
}
pbVol?.addEventListener('input', () => { if (parseFloat(pbVol.value) > 0) pbMuted = false; applyVolume(); });
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

function setTransportEnabled(on) {
    transportIds.forEach(id => { const b = document.getElementById(id); if (b) b.disabled = !on; });
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
    if (embedStage) embedStage.innerHTML = '';
    savedEmbedSrc = null;
}

function showEmbedMode(newMode, vertical) {
    mode = newMode;
    video?.pause();
    if (video) video.style.display = 'none';
    embedStage.hidden = false;
    embedStage.className = 'embed-stage ' + (vertical ? 'tall' : 'wide');
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
                e.target.setPlaybackRate(currentRate);
                e.target.setVolume(Math.round(pbVol.value * 100));
                if (pbMuted) e.target.mute();
            },
            onStateChange: () => updatePlayIcon(),
            onError: e => {
                const code = e && e.data;
                let msg;
                if (code === 153) {
                    msg = location.protocol === 'file:'
                        ? 'YouTube error 153: this page was opened as a local file (file://), so YouTube can\u2019t verify where it is embedded. Run it from a local server (http://localhost) or upload it to a website, then try again.'
                        : 'YouTube error 153: YouTube did not receive a valid referrer from this page. Check that no browser extension or Referrer-Policy header is stripping it.';
                } else if (code === 101 || code === 150) {
                    msg = 'The owner of this YouTube video has turned off embedding. Try another video.';
                } else if (code === 100) {
                    msg = 'This YouTube video was not found or is private.';
                } else if (code === 2) {
                    msg = 'That YouTube link has an invalid video id.';
                } else {
                    msg = 'This YouTube video can\u2019t be played here (it may be private or embedding is turned off).';
                }
                setLinkStatus(msg, true);
            }
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

linkForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const raw = linkInput.value.trim();
    if (!raw) { setLinkStatus('Paste a YouTube, TikTok or Instagram link first.', true); return; }

    const info = parseVideoLink(raw);
    if (!info) { setLinkStatus('That link isn\u2019t a YouTube, TikTok or Instagram video link.', true); return; }

    try {
        if (info.type === 'youtube') {
            if (!/^[\w-]{11}$/.test(info.id)) { setLinkStatus('That YouTube link looks incomplete.', true); return; }
            setLinkStatus('Loading YouTube video\u2026', false);
            await loadYouTube(info.id, info.vertical);
            setLinkStatus('Now learning from YouTube. ' + LINK_HINT, false);
        } else if (info.type === 'tiktok') {
            loadIframe('https://www.tiktok.com/embed/v2/' + info.id);
            setLinkStatus('Now learning from TikTok. Use the player\u2019s own controls; Mirror still works.', false);
        } else if (info.type === 'tiktok-short') {
            setLinkStatus('Short TikTok links (vm.tiktok.com) can\u2019t be read. Open it in your browser and copy the full link that contains /video/.', true);
        } else if (info.type === 'instagram') {
            loadIframe('https://www.instagram.com/' + info.kind + '/' + info.id + '/embed');
            setLinkStatus('Now learning from Instagram. Use the player\u2019s own controls; Mirror still works.', false);
        }
    } catch (err) {
        setLinkStatus(err.message || 'Could not load that video.', true);
    }
});

/* Leaving the Dance page stops the sound; coming back restores the embed */
function suspendEmbed() {
    if (mode === 'youtube') { try { ytPlayer?.pauseVideo(); } catch (e) { } }
    if (mode === 'embed') {
        const f = embedStage.querySelector('iframe');
        if (f && f.src !== 'about:blank') { savedEmbedSrc = f.src; f.src = 'about:blank'; }
    }
    if (mode === 'file') video?.pause();
}
function resumeEmbed() {
    if (mode === 'embed' && savedEmbedSrc) {
        const f = embedStage.querySelector('iframe');
        if (f) f.src = savedEmbedSrc;
        savedEmbedSrc = null;
    }
}
document.querySelectorAll('.nav-link:not(#dance-nav-link), .nav-logo').forEach(el => el.addEventListener('click', suspendEmbed));
danceNavLink?.addEventListener('click', resumeEmbed);
danceCardBtn?.addEventListener('click', resumeEmbed);

syncPlayerUI();


/* Audio Metronome Logic */
let audioCtx, timerId, isPlaying = false, bpm = 120, tapTimes = [];
const bpmRange = document.getElementById('bpmRange');
const bpmVal = document.getElementById('bpmVal');
const metroToggleBtn = document.getElementById('metroToggleBtn');
const beatLight = document.getElementById('beatLight');


bpmRange?.addEventListener('input', (e) => {
    bpm = e.target.value;
    if (bpmVal) bpmVal.textContent = bpm;
});


metroToggleBtn?.addEventListener('click', () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    isPlaying = !isPlaying;


    if (isPlaying) {
        metroToggleBtn.textContent = 'Stop Metronome';
        metroToggleBtn.classList.add('active-btn');
        runMetronome();
    } else {
        metroToggleBtn.textContent = 'Start Metronome';
        metroToggleBtn.classList.remove('active-btn');
        clearTimeout(timerId);
        if (beatLight) {
            beatLight.style.background = 'rgba(255,255,255,0.2)';
            beatLight.style.boxShadow = 'none';
        }
    }
});


function runMetronome() {
    if (!isPlaying) return;


    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);


    if (beatLight) {
        beatLight.style.background = 'var(--pink, #f8b8d8)';
        beatLight.style.boxShadow = '0 0 20px var(--pink, #f8b8d8)';
    }
    setTimeout(() => {
        if (beatLight) {
            beatLight.style.background = 'rgba(255,255,255,0.2)';
            beatLight.style.boxShadow = 'none';
        }
    }, 100);


    timerId = setTimeout(runMetronome, (60 / bpm) * 1000);
}


document.getElementById('tapTempoBtn')?.addEventListener('click', () => {
    const now = Date.now();
    tapTimes.push(now);
    if (tapTimes.length > 4) tapTimes.shift();


    if (tapTimes.length > 1) {
        let diffs = [];
        for (let i = 1; i < tapTimes.length; i++) diffs.push(tapTimes[i] - tapTimes[i - 1]);
        const calcBpm = Math.round(60000 / (diffs.reduce((a, b) => a + b) / diffs.length));


        if (calcBpm >= 40 && calcBpm <= 220) {
            bpm = calcBpm;
            if (bpmRange) bpmRange.value = bpm;
            if (bpmVal) bpmVal.textContent = bpm;
        }
    }
});


/* Rhythm Waveform Visualizer */
const canvas = document.getElementById('rhythmCanvas');
if (canvas) {
    const ctx = canvas.getContext('2d');
    let phase = 0;


    function drawWave() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.strokeStyle = '#f8b8d8';
        ctx.lineWidth = 2.5;


        const amp = isPlaying ? 22 : 8;
        for (let x = 0; x < canvas.width; x++) {
            const y = canvas.height / 2 + Math.sin(x * 0.035 + phase) * amp * Math.cos(x * 0.01);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        phase += isPlaying ? (bpm / 550) : 0.03;
        requestAnimationFrame(drawWave);
    }
    drawWave();
}


/* Upload your own dance video */
const uploadInput = document.getElementById('videoUpload');
const uploadName = document.getElementById('uploadName');
const uploadZone = document.getElementById('uploadZone');
let currentVideoURL = null;


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
    video.play().catch(() => {});
    if (uploadName) uploadName.textContent = 'Now learning: ' + file.name;
}


uploadInput?.addEventListener('change', e => loadUploadedVideo(e.target.files[0]));
['dragenter', 'dragover'].forEach(t => uploadZone?.addEventListener(t, e => { e.preventDefault(); uploadZone.classList.add('drag'); }));
['dragleave', 'drop'].forEach(t => uploadZone?.addEventListener(t, e => { e.preventDefault(); uploadZone.classList.remove('drag'); }));
uploadZone?.addEventListener('drop', e => loadUploadedVideo(e.dataTransfer.files[0]));
/* =========================================================
   GALLERY PAGE
   ========================================================= */


const galleryContainer =
    document.getElementById('gallery-page-container');


const galleryNavLink =
    document.getElementById('gallery-nav-link');


const gallerySearch =
    document.getElementById('gallerySearch');


const galleryFilters =
    document.querySelectorAll('.gallery-filter');


const videoGallery =
    document.getElementById('videoGallery');


const videoUpload =
    document.getElementById('galleryVideoUpload');


const galleryEmpty =
    document.getElementById('galleryEmpty');


const videoCount =
    document.getElementById('videoCount');


const completedCount =
    document.getElementById('completedCount');




/* =========================================================
   OPEN GALLERY
   ========================================================= */


function openGalleryView(e) {


    if (e) e.preventDefault();


    if (mainHero) {
        mainHero.style.display = 'none';
    }


    if (pageSections) {
        pageSections.style.display = 'none';
    }


    if (danceContainer) {
        danceContainer.style.display = 'none';
    }


    if (galleryContainer) {
        galleryContainer.style.display = 'block';
    }


    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });


    updateGalleryStats();
}




/* =========================================================
   GALLERY NAVIGATION
   ========================================================= */


galleryNavLink?.addEventListener(
    'click',
    openGalleryView
);




/* Update the existing home navigation links */


homeNavLinks.forEach(link => {


    link.addEventListener('click', function(e) {


        if (this.id === 'gallery-nav-link') {
            return;
        }


        if (galleryContainer) {
            galleryContainer.style.display = 'none';
        }


        openHomeView(e);


    });


});




/* Logo returns home */


logoLink?.addEventListener('click', function(e) {


    if (galleryContainer) {
        galleryContainer.style.display = 'none';
    }


    openHomeView(e);


});




/* =========================================================
   GALLERY FILTERS
   ========================================================= */


let currentGalleryFilter = 'all';


galleryFilters.forEach(filter => {


    filter.addEventListener('click', () => {


        galleryFilters.forEach(btn => {
            btn.classList.remove('active-filter');
        });


        filter.classList.add('active-filter');


        currentGalleryFilter =
            filter.dataset.filter;


        filterGallery();


    });


});




/* =========================================================
   SEARCH
   ========================================================= */


gallerySearch?.addEventListener('input', () => {
    filterGallery();
});




function filterGallery() {


    const searchText =
        gallerySearch?.value.toLowerCase().trim() || '';


    const cards =
        document.querySelectorAll('.video-card');


    let visibleCards = 0;


    cards.forEach(card => {


        const category =
            card.dataset.category || '';


        const title =
            card.dataset.title?.toLowerCase() || '';


        const description =
            card.querySelector('.video-info > p')
                ?.textContent.toLowerCase() || '';


        const matchesSearch =
            title.includes(searchText) ||
            description.includes(searchText) ||
            category.includes(searchText);


        let matchesFilter = true;


        if (currentGalleryFilter !== 'all') {


            if (currentGalleryFilter === 'favourite') {


                matchesFilter =
                    card.querySelector('.favourite-btn')
                        ?.classList.contains('is-favourite');


            } else {


                matchesFilter =
                    category === currentGalleryFilter;
            }
        }


        if (matchesSearch && matchesFilter) {


            card.classList.remove('hidden');
            visibleCards++;


        } else {


            card.classList.add('hidden');


        }


    });




    if (galleryEmpty) {


        galleryEmpty.classList.toggle(
            'visible',
            visibleCards === 0
        );


    }


}




/* =========================================================
   FAVOURITES
   ========================================================= */


document.addEventListener('click', e => {


    const favourite =
        e.target.closest('.favourite-btn');


    if (!favourite) return;


    favourite.classList.toggle('is-favourite');


    if (favourite.classList.contains('is-favourite')) {
        favourite.textContent = '♥';
    } else {
        favourite.textContent = '♡';
    }


    filterGallery();


});




/* =========================================================
   COMPLETE VIDEO
   ========================================================= */


document.addEventListener('click', e => {


    const button =
        e.target.closest('.complete-video');


    if (!button) return;


    const card =
        button.closest('.video-card');


    if (!card) return;


    const status =
        card.querySelector('.video-status');


    const progress =
        card.querySelector('.progress-bar span');


    const percentage =
        card.querySelector('.progress-label strong');


    if (status) {


        status.textContent = 'Completed';


        status.classList.remove(
            'status-progress'
        );


        status.classList.add(
            'status-complete'
        );


    }


    if (progress) {
        progress.style.width = '100%';
    }


    if (percentage) {
        percentage.textContent = '100%';
    }


    button.textContent = 'Completed ✓';
    button.classList.add('completed');


    updateGalleryStats();


});




/* =========================================================
   DELETE VIDEO
   ========================================================= */


document.addEventListener('click', e => {


    const button =
        e.target.closest('.delete-video');


    if (!button) return;


    const card =
        button.closest('.video-card');


    if (!card) return;


    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';


    setTimeout(() => {


        card.remove();


        updateGalleryStats();
        filterGallery();


    }, 300);


});




/* =========================================================
   VIDEO UPLOAD
   ========================================================= */


videoUpload?.addEventListener('change', e => {


    const files =
        Array.from(e.target.files);


    files.forEach(file => {


        if (!file.type.startsWith('video/')) {
            return;
        }


        createVideoCard(file);


    });


    videoUpload.value = '';


    updateGalleryStats();


});




function createVideoCard(file) {


    const videoURL =
        URL.createObjectURL(file);


    const card =
        document.createElement('article');


    card.className = 'video-card';


    card.dataset.category = 'practice';


    card.dataset.title =
        file.name
            .replace(/\.[^/.]+$/, '');


    const today =
        new Date().toLocaleDateString(
            'en-US',
            {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }
        );


    card.innerHTML = `


        <div class="video-preview">


            <video controls>
                <source
                    src="${videoURL}"
                    type="${file.type}">
            </video>


            <button
                class="favourite-btn"
                aria-label="Favourite video">
                ♡
            </button>


        </div>


        <div class="video-info">


            <div class="video-title-row">


                <h3>
                    ${file.name.replace(/\.[^/.]+$/, '')}
                </h3>


                <span class="video-status status-progress">
                    In Progress
                </span>


            </div>


            <p>
                Newly added dance video.
            </p>


            <div class="video-meta">


                <span>Practice</span>
                <span>•</span>
                <span>${today}</span>


            </div>


            <div class="video-progress">


                <div class="progress-label">


                    <span>Progress</span>
                    <strong>0%</strong>


                </div>


                <div class="progress-bar">


                    <span style="width: 0%;"></span>


                </div>


            </div>


            <div class="video-actions">


                <button class="complete-video">
                    Mark Complete
                </button>


                <button class="delete-video">
                    Delete
                </button>


            </div>


        </div>
    `;


    videoGallery.prepend(card);


    filterGallery();


}




/* =========================================================
   GALLERY STATISTICS
   ========================================================= */


function updateGalleryStats() {


    const cards =
        document.querySelectorAll(
            '.video-card'
        );


    const completed =
        document.querySelectorAll(
            '.video-status.status-complete'
        );


    if (videoCount) {
        videoCount.textContent =
            cards.length;
    }


    if (completedCount) {
        completedCount.textContent =
            completed.length;
    }


}




/* Initial count */


updateGalleryStats();


