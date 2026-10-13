// Cards drift toward the mouse and tilt when the pointer is nearby.
const cards = document.querySelectorAll('[data-card]');
const RANGE = 380;
const MOVE = 22;
const TILT = 12;
const reduce = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
).matches;

const state = [...cards].map(el => ({
    el,
    x: 0,
    y: 0,
    rx: 0,
    ry: 0,
    tx: 0,
    ty: 0,
    trx: 0,
    try_: 0
}));

let mouse = null;

window.addEventListener('mousemove', e => {
    mouse = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseleave', () => {
    mouse = null;
});

function tick() {
    state.forEach(s => {
        s.tx = s.ty = s.trx = s.try_ = 0;

        if (mouse && !reduce && window.innerWidth > 800) {
            const r = s.el.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const dx = mouse.x - cx;
            const dy = mouse.y - cy;
            const dist = Math.hypot(dx, dy);
            const power = Math.max(0, 1 - dist / RANGE);

            const nx = Math.max(
                -1,
                Math.min(1, dx / (r.width / 2 || 1))
            );

            const ny = Math.max(
                -1,
                Math.min(1, dy / (r.height / 2 || 1))
            );

            s.tx = (dx / (dist || 1)) * MOVE * power;
            s.ty = (dy / (dist || 1)) * MOVE * power;
            s.trx = -ny * TILT * power;
            s.try_ = nx * TILT * power;

            s.el.style.setProperty(
                '--mx',
                `${((mouse.x - r.left) / (r.width || 1)) * 100}%`
            );

            s.el.style.setProperty(
                '--my',
                `${((mouse.y - r.top) / (r.height || 1)) * 100}%`
            );

            s.el.style.setProperty('--glow', power.toFixed(2));
        } else {
            s.el.style.setProperty('--glow', 0);
        }

        s.x += (s.tx - s.x) * 0.1;
        s.y += (s.ty - s.y) * 0.1;
        s.rx += (s.trx - s.rx) * 0.1;
        s.ry += (s.try_ - s.ry) * 0.1;

        s.el.style.transform =
            `translate3d(${s.x}px, ${s.y}px, 0) ` +
            `perspective(800px) rotateX(${s.rx}deg) rotateY(${s.ry}deg)`;
    });

    requestAnimationFrame(tick);
}

if (state.length && !reduce) {
    tick();
}


// Scroll reveal.
if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in');
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
} else {
    document.querySelectorAll('.reveal').forEach(el => {
        el.classList.add('in');
    });
}


// Duplicate review cards for a seamless marquee.
const track = document.getElementById('track');

if (track && !track.dataset.cloned) {
    [...track.children].forEach(card => {
        const clone = card.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
    });

    track.dataset.cloned = 'true';
}


// Screenshot frames tilt under the pointer.
document.querySelectorAll('.shot').forEach(el => {
    el.addEventListener('mousemove', e => {
        if (reduce) return;

        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / (r.width || 1) - 0.5;
        const y = (e.clientY - r.top) / (r.height || 1) - 0.5;

        el.style.setProperty('--tx', `${x * 8}deg`);
        el.style.setProperty('--ty', `${-y * 8}deg`);
    });

    el.addEventListener('mouseleave', () => {
        el.style.setProperty('--tx', '0deg');
        el.style.setProperty('--ty', '0deg');
    });
});


// Decorations shift slightly with the mouse.
const decos = document.querySelectorAll('.deco');

window.addEventListener('mousemove', e => {
    if (reduce || window.innerWidth <= 800) return;

    const nx = e.clientX / window.innerWidth - 0.5;
    const ny = e.clientY / window.innerHeight - 0.5;

    decos.forEach(d => {
        const k = Number(d.dataset.depth) || 0;
        d.style.translate = `${-nx * k}px ${-ny * k}px`;
    });
});


/* =========================================================
   PRACTICE VIDEO EDITOR
   The editor remains in video-editor.js.
   ========================================================= */


/* =========================================================
   AUDIO METRONOME
   ========================================================= */

let audioCtx;
let timerId;
let isPlaying = false;
let bpm = 120;
let tapTimes = [];

const bpmRange = document.getElementById('bpmRange');
const bpmVal = document.getElementById('bpmVal');
const metroToggleBtn = document.getElementById('metroToggleBtn');
const beatLight = document.getElementById('beatLight');

bpmRange?.addEventListener('input', e => {
    bpm = Number(e.target.value);

    if (bpmVal) {
        bpmVal.textContent = bpm;
    }
});

metroToggleBtn?.addEventListener('click', async () => {
    try {
        if (!audioCtx) {
            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                throw new Error('Audio is not supported in this browser.');
            }

            audioCtx = new AudioContextClass();
        }

        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

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
    } catch (error) {
        console.error('Could not start the metronome:', error);
    }
});

function runMetronome() {
    if (!isPlaying || !audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.frequency.value = 880;
    gain.gain.setValueAtTime(1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioCtx.currentTime + 0.08
    );

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

    if (tapTimes.length > 4) {
        tapTimes.shift();
    }

    if (tapTimes.length > 1) {
        const diffs = [];

        for (let i = 1; i < tapTimes.length; i++) {
            diffs.push(tapTimes[i] - tapTimes[i - 1]);
        }

        const calcBpm = Math.round(
            60000 / (diffs.reduce((a, b) => a + b, 0) / diffs.length)
        );

        if (calcBpm >= 40 && calcBpm <= 220) {
            bpm = calcBpm;

            if (bpmRange) bpmRange.value = bpm;
            if (bpmVal) bpmVal.textContent = bpm;
        }
    }
});


/* =========================================================
   RHYTHM WAVEFORM VISUALIZER
   ========================================================= */

const canvas = document.getElementById('rhythmCanvas');

if (canvas) {
    const ctx = canvas.getContext('2d');
    let phase = 0;

    function drawWave() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.strokeStyle = '#f8b8d8';
        ctx.lineWidth = 2.5;

        const amp = isPlaying ? 22 : 8;

        for (let x = 0; x < canvas.width; x++) {
            const y =
                canvas.height / 2 +
                Math.sin(x * 0.035 + phase) * amp * Math.cos(x * 0.01);

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();

        if (!reduce) {
            phase += isPlaying ? bpm / 550 : 0.03;
        }

        requestAnimationFrame(drawWave);
    }

    drawWave();
}


/* =========================================================
   MUSE GALLERY
   Video files and metadata are stored in IndexedDB.
   ========================================================= */

const gallerySearch = document.getElementById('gallerySearch');
const galleryFilters = document.querySelectorAll('.gallery-filter');
const videoGallery = document.getElementById('videoGallery');
const videoUpload = document.getElementById('galleryVideoUpload');
const galleryEmpty = document.getElementById('galleryEmpty');
const videoCount = document.getElementById('videoCount');
const completedCount = document.getElementById('completedCount');

const uploadModal = document.getElementById('uploadModal');
const uploadPanel = document.getElementById('uploadPanel');
const openUploadForm = document.getElementById('openUploadForm');
const closeUploadForm = document.getElementById('closeUploadForm');
const uploadForm = document.getElementById('galleryUploadForm');
const cancelUpload = document.getElementById('cancelUpload');
const uploadMessage = document.getElementById('uploadMessage');
const saveGalleryVideo = document.getElementById('saveGalleryVideo');

const newVideoTitle = document.getElementById('newVideoTitle');
const newVideoCategory = document.getElementById('newVideoCategory');
const newVideoDescription = document.getElementById('newVideoDescription');
const newVideoProgress = document.getElementById('newVideoProgress');
const newVideoProgressLabel = document.getElementById('newVideoProgressLabel');

let currentGalleryFilter = 'all';
let galleryDBPromise = null;

const galleryObjectURLs = new Map();




/* =========================================================
   UPLOAD POPUP
   ========================================================= */

function clearUploadForm() {
    uploadForm?.reset();

    if (newVideoProgressLabel) {
        newVideoProgressLabel.textContent = '0%';
    }

    if (uploadMessage) {
        uploadMessage.textContent = '';
    }

    if (saveGalleryVideo) {
        saveGalleryVideo.disabled = false;
        saveGalleryVideo.textContent = 'Save Video';
    }
}

function openUploadModal() {
    if (!uploadModal) {
        console.error('Upload popup #uploadModal was not found.');
        return;
    }

    clearUploadForm();

    uploadModal.hidden = false;
    document.body.classList.add('modal-open');

    window.setTimeout(() => {
        newVideoTitle?.focus();
    }, 50);
}

function closeUploadModal() {
    if (!uploadModal) return;

    uploadModal.hidden = true;
    document.body.classList.remove('modal-open');

    clearUploadForm();
    openUploadForm?.focus();
}

openUploadForm?.addEventListener('click', openUploadModal);
closeUploadForm?.addEventListener('click', closeUploadModal);
cancelUpload?.addEventListener('click', closeUploadModal);

// Close when clicking the dark backdrop.
uploadModal?.addEventListener('click', event => {
    if (event.target === uploadModal) {
        closeUploadModal();
    }
});

// Close with Escape.
document.addEventListener('keydown', event => {
    if (
        event.key === 'Escape' &&
        uploadModal &&
        !uploadModal.hidden
    ) {
        closeUploadModal();
    }
});

// Keep the progress percentage synchronized.
newVideoProgress?.addEventListener('input', () => {
    if (newVideoProgressLabel) {
        newVideoProgressLabel.textContent =
            `${newVideoProgress.value}%`;
    }
});

/* =========================================================
   INDEXEDDB STORAGE
   ========================================================= */

function openGalleryDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('MUSEGalleryDB', 1);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains('videos')) {
                db.createObjectStore('videos', { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);

        request.onerror = () => reject(
            request.error || new Error('Could not open video storage.')
        );
    });
}

if (videoGallery) {
    galleryDBPromise = openGalleryDB();
}

async function getGalleryDB() {
    if (!galleryDBPromise) {
        galleryDBPromise = openGalleryDB();
    }

    return galleryDBPromise;
}

async function getAllSavedVideos() {
    const db = await getGalleryDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('videos', 'readonly');
        const request = transaction.objectStore('videos').getAll();

        request.onsuccess = () => resolve(request.result || []);

        request.onerror = () => reject(
            request.error || new Error('Could not load saved videos.')
        );
    });
}

async function saveGalleryRecord(record) {
    const db = await getGalleryDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('videos', 'readwrite');

        transaction.objectStore('videos').put(record);

        transaction.oncomplete = () => resolve(record);

        transaction.onerror = () => reject(
            transaction.error || new Error('Could not save the video.')
        );

        transaction.onabort = () => reject(
            transaction.error || new Error('Saving the video was cancelled.')
        );
    });
}

async function deleteGalleryRecord(id) {
    const db = await getGalleryDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('videos', 'readwrite');

        transaction.objectStore('videos').delete(id);

        transaction.oncomplete = () => resolve();

        transaction.onerror = () => reject(
            transaction.error || new Error('Could not delete the video.')
        );

        transaction.onabort = () => reject(
            transaction.error || new Error('Deleting the video was cancelled.')
        );
    });
}




/* =========================================================
   SAVE A VIDEO FROM THE POPUP
   ========================================================= */

uploadForm?.addEventListener('submit', async event => {
    event.preventDefault();

    if (!newVideoTitle || !videoUpload || !saveGalleryVideo) {
        return;
    }

    const title = newVideoTitle.value.trim();
    const file = videoUpload.files?.[0];

    if (!title) {
        if (uploadMessage) {
            uploadMessage.textContent = 'Please enter a video title.';
        }

        newVideoTitle.focus();
        return;
    }

    if (!file) {
        if (uploadMessage) {
            uploadMessage.textContent = 'Please choose a video file.';
        }

        videoUpload.focus();
        return;
    }

    if (!file.type.startsWith('video/')) {
        if (uploadMessage) {
            uploadMessage.textContent =
                'Please select a valid video file.';
        }

        videoUpload.focus();
        return;
    }

    const MAX_VIDEO_SIZE = 500 * 1024 * 1024;

    if (file.size > MAX_VIDEO_SIZE) {
        if (uploadMessage) {
            uploadMessage.textContent =
                'This video exceeds the 500 MB limit. Please choose a smaller file.';
        }

        return;
    }

    const record = {
        id: (
            window.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random().toString(36).slice(2)}`
        ),
        title,
        category: newVideoCategory?.value || '',
        description: newVideoDescription?.value.trim() || '',
        progress: Number(newVideoProgress?.value || 0),
        favourite: false,
        dateAdded: new Date().toISOString(),
        fileName: file.name,
        fileType: file.type,
        videoBlob: file
    };

    saveGalleryVideo.disabled = true;
    saveGalleryVideo.textContent = 'Saving...';

    if (uploadMessage) {
        uploadMessage.textContent = 'Saving your dance video...';
    }

    try {
        await saveGalleryRecord(record);
        await renderSavedVideos();

        // Close and clear only after the save succeeds.
        closeUploadModal();
    } catch (error) {
        console.error('Error saving gallery video:', error);

        if (uploadMessage) {
            uploadMessage.textContent =
                'Could not save the video. Check browser storage and try again.';
        }

        saveGalleryVideo.disabled = false;
        saveGalleryVideo.textContent = 'Save Video';
    }
});

/* =========================================================
   CREATE VIDEO CARDS
   ========================================================= */

function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
}

function createVideoCard(record) {
    const card = el('article', 'video-card');

    card.dataset.id = record.id;
    card.dataset.category = record.category || '';
    card.dataset.title = record.title || '';

    // Video preview.
    const preview = el('div', 'video-preview');
    const player = el('video');

    player.controls = true;
    player.preload = 'metadata';

    const objectURL = URL.createObjectURL(record.videoBlob);
    galleryObjectURLs.set(record.id, objectURL);
    player.src = objectURL;

    const favourite = el(
        'button',
        `favourite-btn${record.favourite ? ' is-favourite' : ''}`,
        record.favourite ? '♥' : '♡'
    );

    favourite.type = 'button';
    favourite.setAttribute('aria-label', 'Favourite video');
    favourite.setAttribute('aria-pressed', String(!!record.favourite));

    preview.append(player, favourite);

    // Title and status.
    const titleRow = el('div', 'video-title-row');

    titleRow.appendChild(
        el('h3', null, record.title || 'Untitled dance')
    );

    const isComplete = Number(record.progress) >= 100;

    titleRow.appendChild(
        el(
            'span',
            `video-status ${isComplete ? 'status-complete' : 'status-progress'}`,
            isComplete ? 'Completed' : 'In Progress'
        )
    );

    // Category and date.
    const metaRow = el('div', 'video-meta');

    const categoryLabel = {
        practice: 'Practice',
        performance: 'Performance',
        other: 'Other',
        recording: 'Recording'
    }[record.category] || record.category || 'Uncategorized';

    metaRow.append(
        el('span', null, categoryLabel),
        el('span', null, '•'),
        el(
            'span',
            null,
            new Date(record.dateAdded).toLocaleDateString('en-CA', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            })
        )
    );

    // Progress.
    const progressLabel = el('div', 'progress-label');

    progressLabel.append(
        el('span', null, 'Progress'),
        el('strong', null, `${record.progress || 0}%`)
    );

    const progressBar = el('div', 'progress-bar');
    const progressFill = el('span');

    progressFill.style.width = `${record.progress || 0}%`;
    progressBar.appendChild(progressFill);

    const progressSection = el('div', 'video-progress');
    progressSection.append(progressLabel, progressBar);

    // Actions.
    const actions = el('div', 'video-actions');

    const completeButton = el(
        'button',
        `complete-video${isComplete ? ' completed' : ''}`,
        isComplete ? 'Completed ✓' : 'Mark Complete'
    );

    completeButton.type = 'button';

    const deleteButton = el('button', 'delete-video', 'Delete');
    deleteButton.type = 'button';

    actions.append(completeButton, deleteButton);

    // Assemble card.
    const info = el('div', 'video-info');

    info.append(
        titleRow,
        el('p', null, record.description || 'No description added.'),
        metaRow,
        progressSection,
        actions
    );

    card.append(preview, info);

    return card;
}


/* =========================================================
   RENDER VIDEOS AND UPDATE STATISTICS
   ========================================================= */

async function renderSavedVideos() {
    if (!videoGallery) return;

    const records = await getAllSavedVideos();

    // Release old video preview URLs before rebuilding the gallery.
    galleryObjectURLs.forEach(url => URL.revokeObjectURL(url));
    galleryObjectURLs.clear();

    videoGallery.replaceChildren();

    records.sort(
        (a, b) => new Date(b.dateAdded) - new Date(a.dateAdded)
    );

    records.forEach(record => {
        videoGallery.appendChild(createVideoCard(record));
    });

    if (videoCount) {
        videoCount.textContent = records.length;
    }

    if (completedCount) {
        completedCount.textContent = records.filter(
            record => Number(record.progress) >= 100
        ).length;
    }

    filterGallery();
}


/* =========================================================
   SEARCH AND FILTERS
   ========================================================= */

galleryFilters.forEach(filter => {
    filter.addEventListener('click', () => {
        galleryFilters.forEach(button => {
            button.classList.remove('active-filter');
        });

        filter.classList.add('active-filter');
        currentGalleryFilter = filter.dataset.filter || 'all';

        filterGallery();
    });
});

gallerySearch?.addEventListener('input', filterGallery);

function filterGallery() {
    if (!videoGallery) return;

    const searchText =
        gallerySearch?.value.toLowerCase().trim() || '';

    let visibleCards = 0;

    videoGallery.querySelectorAll('.video-card').forEach(card => {
        const title = (card.dataset.title || '').toLowerCase();
        const category = (card.dataset.category || '').toLowerCase();

        const description =
            card.querySelector('.video-info > p')?.textContent.toLowerCase() || '';

        const matchesSearch =
            title.includes(searchText) ||
            description.includes(searchText) ||
            category.includes(searchText);

        let matchesFilter = true;

        if (currentGalleryFilter === 'favourite') {
            matchesFilter = !!card
                .querySelector('.favourite-btn')
                ?.classList.contains('is-favourite');
        } else if (currentGalleryFilter !== 'all') {
            matchesFilter = category === currentGalleryFilter;
        }

        const isVisible = matchesSearch && matchesFilter;

        card.classList.toggle('hidden', !isVisible);

        if (isVisible) visibleCards++;
    });

    if (galleryEmpty) {
        // Do not show the empty state while videos exist but are filtered out.
        const hasAnyVideos = videoGallery.querySelector('.video-card') !== null;
        galleryEmpty.classList.toggle(
            'visible',
            !hasAnyVideos || visibleCards === 0
        );

        if (!hasAnyVideos) {
            const heading = galleryEmpty.querySelector('h2');
            const message = galleryEmpty.querySelector('p');

            if (heading) heading.textContent = 'No videos yet';
            if (message) {
                message.textContent =
                    'Add your first dance video to start your collection.';
            }
        } else if (visibleCards === 0) {
            const heading = galleryEmpty.querySelector('h2');
            const message = galleryEmpty.querySelector('p');

            if (heading) heading.textContent = 'No matching videos';
            if (message) {
                message.textContent =
                    'Try another search or select a different filter.';
            }
        }
    }
}


/* =========================================================
   FAVOURITE, COMPLETE, AND DELETE ACTIONS
   ========================================================= */

videoGallery?.addEventListener('click', async event => {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const favouriteButton = target.closest('.favourite-btn');
    const completeButton = target.closest('.complete-video');
    const deleteButton = target.closest('.delete-video');

    const button = favouriteButton || completeButton || deleteButton;

    if (!button) return;

    const card = button.closest('.video-card');
    const id = card?.dataset.id;

    if (!id) return;

    try {
        const records = await getAllSavedVideos();
        const record = records.find(item => item.id === id);

        if (!record) return;

        if (favouriteButton) {
            record.favourite = !record.favourite;
        } else if (completeButton) {
            record.progress = 100;
        } else if (deleteButton) {
            const confirmed = window.confirm(
                `Delete "${record.title}" from your gallery?`
            );

            if (!confirmed) return;

            await deleteGalleryRecord(id);
            await renderSavedVideos();
            return;
        }

        await saveGalleryRecord(record);
        await renderSavedVideos();
    } catch (error) {
        console.error('Could not update gallery video:', error);

        window.alert(
            'Your video could not be updated. Please try again.'
        );
    }
});


/* =========================================================
   RECORDINGS FROM THE LIVE POSE MIRROR
   ========================================================= */

window.MUSE = window.MUSE || {};

window.MUSE.gallery = {
    addRecording(blob, name) {
        if (!blob || !videoGallery) return false;

        const fileName = name || 'Dance Recording';
        const title = fileName.replace(/\.[^/.]+$/, '');

        const record = {
            id: (
                window.crypto?.randomUUID?.() ||
                `${Date.now()}-${Math.random().toString(36).slice(2)}`
            ),
            title: title || 'Dance Recording',
            category: 'practice',
            description: 'Recorded in the Live Pose Mirror.',
            progress: 0,
            favourite: false,
            dateAdded: new Date().toISOString(),
            fileName,
            fileType: blob.type || 'video/webm',
            videoBlob: blob
        };

        saveGalleryRecord(record)
            .then(() => renderSavedVideos())
            .catch(error => {
                console.error('Could not save the recording:', error);
            });

        return true;
    }
};


/* =========================================================
   INITIALIZE THE GALLERY
   ========================================================= */


/* =========================================================
   INITIALIZE THE GALLERY
   ========================================================= */

if (videoGallery) {
    if (galleryEmpty) {
        galleryEmpty.classList.remove('visible');
    }

    renderSavedVideos().catch(error => {
        console.error('Could not load the MUSE gallery:', error);
    });
}


/* =========================================================
   LOGIN AND CREATE ACCOUNT FORM SWITCHING
   ========================================================= */

const signInForm = document.getElementById('sign-in-form');
const signUpForm = document.getElementById('sign-up-form');

const showSignUpButton = document.getElementById('show-sign-up');
const showSignInButton = document.getElementById('show-sign-in');

const authMessage = document.getElementById('auth-message');

if (showSignUpButton && signInForm && signUpForm) {
    showSignUpButton.addEventListener('click', () => {
        signInForm.hidden = true;
        signUpForm.hidden = false;

        if (authMessage) {
            authMessage.textContent = '';
        }
    });
}

if (showSignInButton && signInForm && signUpForm) {
    showSignInButton.addEventListener('click', () => {
        signUpForm.hidden = true;
        signInForm.hidden = false;

        if (authMessage) {
            authMessage.textContent = '';
        }
    });
}
/* =========================================================
   LOCAL EMAIL AUTHENTICATION & SESSION MANAGEMENT
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    const signInForm = document.getElementById("sign-in-form");
    const signUpForm = document.getElementById("sign-up-form");
    const showSignUpBtn = document.getElementById("show-sign-up");
    const showSignInBtn = document.getElementById("show-sign-in");
    const resetPasswordBtn = document.getElementById("reset-password-button");
    const logoutBtn = document.getElementById("logout-button");
    const authMessage = document.getElementById("auth-message");
    const welcomeMessage = document.getElementById("welcome-message");
    const signedInPanel = document.getElementById("signed-in-panel");
    const authForms = document.getElementById("auth-forms");

    if (!signInForm || !signUpForm) return; // Exit if not on the login page

    // Check if user is already logged in from a previous session
    const activeUser = JSON.parse(localStorage.getItem("muse_active_user"));
    if (activeUser) {
        if (authForms) authForms.hidden = true;
        if (signedInPanel) signedInPanel.hidden = false;
        if (welcomeMessage) welcomeMessage.textContent = `Welcome back, ${activeUser.name}!`;
    }

    // Toggle between Sign In and Create Account forms
    showSignUpBtn?.addEventListener("click", () => {
        signInForm.hidden = true;
        signUpForm.hidden = false;
        if (authMessage) authMessage.textContent = "";
    });

    showSignInBtn?.addEventListener("click", () => {
        signUpForm.hidden = true;
        signInForm.hidden = false;
        if (authMessage) authMessage.textContent = "";
    });

    // Handle Create Account (Sign Up)
    signUpForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("display-name")?.value.trim();
        const email = document.getElementById("sign-up-email")?.value.trim();
        const password = document.getElementById("sign-up-password")?.value;
        const confirmPassword = document.getElementById("confirm-password")?.value;

        if (password !== confirmPassword) {
            if (authMessage) authMessage.textContent = "Passwords do not match.";
            return;
        }

        // Save user data locally
        localStorage.setItem("muse_user", JSON.stringify({ name, email, password }));
        
        if (authMessage) authMessage.textContent = "Account created successfully! Please sign in.";
        signUpForm.hidden = true;
        signInForm.hidden = false;
        signUpForm.reset();
    });

    // Handle Sign In
    signInForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = document.getElementById("sign-in-email")?.value.trim();
        const password = document.getElementById("sign-in-password")?.value;

        const savedUser = JSON.parse(localStorage.getItem("muse_user"));

        if (savedUser && savedUser.email === email && savedUser.password === password) {
            localStorage.setItem("muse_active_user", JSON.stringify(savedUser));
            if (authForms) authForms.hidden = true;
            if (signedInPanel) signedInPanel.hidden = false;
            if (welcomeMessage) welcomeMessage.textContent = `Welcome back, ${savedUser.name}!`;
            if (authMessage) authMessage.textContent = "";
        } else {
            if (authMessage) authMessage.textContent = "Invalid email or password (or no account found).";
        }
    });

    // Handle Password Reset
    resetPasswordBtn?.addEventListener("click", () => {
        const email = document.getElementById("sign-in-email")?.value.trim();
        if (!email) {
            if (authMessage) authMessage.textContent = "Please enter your email above first.";
            document.getElementById("sign-in-email")?.focus();
            return;
        }
        if (authMessage) authMessage.textContent = `Password reset link sent to ${email} (simulation).`;
    });

    // Handle Log Out
    logoutBtn?.addEventListener("click", () => {
        localStorage.removeItem("muse_active_user");
        if (signedInPanel) signedInPanel.hidden = true;
        if (authForms) authForms.hidden = false;
        signInForm.reset();
        if (authMessage) authMessage.textContent = "You have been logged out.";
    });
});

