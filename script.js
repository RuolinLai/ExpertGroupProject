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

/* Video Player Controls */
const video = document.getElementById('danceVideo');
const slowBtn = document.getElementById('slowBtn');
const normalBtn = document.getElementById('normalBtn');
const fastBtn = document.getElementById('fastBtn');
const mirrorBtn = document.getElementById('mirrorBtn');

document.getElementById('playBtn')?.addEventListener('click', () => video?.play());
document.getElementById('pauseBtn')?.addEventListener('click', () => video?.pause());

function setRate(rate, btn) {
    if (video) video.playbackRate = rate;
    [slowBtn, normalBtn, fastBtn].forEach(b => b?.classList.remove('active-btn'));
    btn?.classList.add('active-btn');
}

slowBtn?.addEventListener('click', () => setRate(0.5, slowBtn));
normalBtn?.addEventListener('click', () => setRate(1.0, normalBtn));
fastBtn?.addEventListener('click', () => setRate(1.5, fastBtn));

mirrorBtn?.addEventListener('click', () => {
    if (video) {
        const isMirrored = video.style.transform === 'scaleX(-1)';
        video.style.transform = isMirrored ? 'scaleX(1)' : 'scaleX(-1)';
        mirrorBtn.classList.toggle('active-btn', !isMirrored);
    }
});

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