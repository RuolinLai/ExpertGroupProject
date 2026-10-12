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
        s.x += (s.tx - s.x) * 0.1; s.y += (s.ty - s.y) * 0.1;
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





/* The Practice Video Editor (player bar, speed slider, Mirror, link
   loading and upload) now lives entirely in video-editor.js. */


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


/* =========================================================
   GALLERY PAGE
   ========================================================= */










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




/* Small helper so the card can be built from real DOM nodes.
   Text always goes in as text, so a file name that happens to contain
   HTML characters is shown literally and can never become markup. */
function el(tag, className, text) {


    const node = document.createElement(tag);


    if (className) node.className = className;


    if (text !== undefined) node.textContent = text;


    return node;
}




/* Builds one gallery card.
   `meta` lets a caller override the defaults - camera.js uses it to
   label a recorded take instead of an uploaded file. */
function createVideoCard(file, meta) {


    if (!videoGallery) return null;


    const options = meta || {};


    const title =
        options.title ||
        file.name.replace(/\.[^/.]+$/, '');


    const today =
        new Date().toLocaleDateString(
            'en-US',
            {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }
        );


    const card = el('article', 'video-card');


    card.dataset.category =
        options.category || 'practice';


    card.dataset.title = title;




    /* ---------- Preview ---------- */


    const preview = el('div', 'video-preview');


    const player = el('video');


    player.controls = true;


    player.src = URL.createObjectURL(file);


    const favourite = el('button', 'favourite-btn', '♡');


    favourite.setAttribute(
        'aria-label',
        'Favourite video'
    );


    preview.append(player, favourite);




    /* ---------- Title row ---------- */


    const titleRow = el('div', 'video-title-row');


    titleRow.append(
        el('h3', null, title),
        el('span', 'video-status status-progress', 'In Progress')
    );




    /* ---------- Meta row ---------- */


    const metaRow = el('div', 'video-meta');


    metaRow.append(
        el('span', null, options.label || 'Practice'),
        el('span', null, '•'),
        el('span', null, today)
    );




    /* ---------- Progress ---------- */


    const progressLabel = el('div', 'progress-label');


    progressLabel.append(
        el('span', null, 'Progress'),
        el('strong', null, '0%')
    );


    const progressBar = el('div', 'progress-bar');


    const progressFill = el('span');


    progressFill.style.width = '0%';


    progressBar.append(progressFill);


    const progress = el('div', 'video-progress');


    progress.append(progressLabel, progressBar);




    /* ---------- Actions ---------- */


    const actions = el('div', 'video-actions');


    actions.append(
        el('button', 'complete-video', 'Mark Complete'),
        el('button', 'delete-video', 'Delete')
    );




    /* ---------- Assemble ---------- */


    const info = el('div', 'video-info');


    info.append(
        titleRow,
        el('p', null, options.description || 'Newly added dance video.'),
        metaRow,
        progress,
        actions
    );


    card.append(preview, info);


    videoGallery.prepend(card);


    filterGallery();


    return card;
}




/* =========================================================
   RECORDINGS FROM THE LIVE POSE MIRROR
   camera.js calls this when a take finishes recording.
   ========================================================= */


window.MUSE = window.MUSE || {};


window.MUSE.gallery = {


    addRecording(blob, name) {


        if (!blob || !videoGallery) return false;


        const file =
            new File([blob], name, { type: blob.type });


        const card = createVideoCard(file, {
            title: name.replace(/\.[^/.]+$/, ''),
            label: 'Recording',
            description: 'Recorded in the Live Pose Mirror.'
        });


        updateGalleryStats();


        return !!card;
    }


};




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


