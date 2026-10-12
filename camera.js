/* =========================================================
   LIVE POSE MIRROR
   Every control of the "Live Pose Mirror" card lives in this file:
   the webcam stream, the MediaPipe pose overlay, the Record button
   that saves a take into the Gallery, and the readouts of the
   "AI Synchronization Analyzer" card.

   The analyzer starts at 0 and only produces numbers while the
   camera is running - stopping the camera resets it back to 0.

   This is a CLASSIC script, not an ES module, and MediaPipe is pulled
   in with a dynamic import() the first time the camera starts.
   A <script type="module" src="..."> is fetched under CORS rules, and
   a page opened straight from disk has the opaque origin "null", so
   the browser would refuse to load this file at all when index.html
   is double-clicked instead of served. Importing the CDN bundle at
   run time avoids that, because the CDN is a real https origin.
   ========================================================= */
(function () {
'use strict';

const VISION_BUNDLE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const TASKS_VISION_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/* Filled in by loadVision() on first use */
let PoseLandmarker = null;
let FilesetResolver = null;
let DrawingUtils = null;
let visionPromise = null;

function loadVision() {
    if (!visionPromise) {
        visionPromise = import(VISION_BUNDLE).then(m => {
            PoseLandmarker = m.PoseLandmarker;
            FilesetResolver = m.FilesetResolver;
            DrawingUtils = m.DrawingUtils;
        }).catch(err => {
            visionPromise = null;          // let the next click retry
            throw new Error('Could not load the pose library (check your internet connection): ' + err.message);
        });
    }
    return visionPromise;
}

/* ---------- Camera panel elements ---------- */
const camVideo = document.getElementById('camVideo');
const camCanvas = document.getElementById('camCanvas');
const startBtn = document.getElementById('camStartBtn');
const stopBtn = document.getElementById('camStopBtn');
const skelBtn = document.getElementById('skelBtn');
const recBtn = document.getElementById('camRecBtn');
const statusEl = document.getElementById('camStatus');
const badge = document.getElementById('camBadge');
const placeholder = document.getElementById('camPlaceholder');
const frame = document.getElementById('camFrame');

/* ---------- AI Synchronization Analyzer elements ---------- */
const syncDial = document.getElementById('syncDial');
const syncScore = document.getElementById('syncScore');
const syncVerdict = document.getElementById('syncVerdict');
const syncTiming = document.getElementById('syncTiming');
const syncAlign = document.getElementById('syncAlign');
const syncEnergy = document.getElementById('syncEnergy');

const ctx = camCanvas?.getContext('2d');
let drawUtils = null;   // built once DrawingUtils has been imported

/* ---------- Camera / pose state ---------- */
let landmarker = null;      // pose model for the webcam
let refLandmarker = null;   // second model instance for the reference video
let stream = null;
let running = false;
let showSkeleton = true;
let lastCamTime = -1;
let lastRefTime = -1;

/* ---------- Recording state ---------- */
let recorder = null;
let recordedChunks = [];
let recStartedAt = 0;

/* =========================================================
   POSE MODEL
   ========================================================= */
async function createLandmarker() {
    const fileset = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM);
    return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1
    });
}

async function loadModels() {
    if (landmarker) return;
    setStatus('Loading pose model...');
    await loadVision();
    if (ctx && !drawUtils) drawUtils = new DrawingUtils(ctx);
    // Two instances are needed because a VIDEO-mode landmarker keeps its own
    // monotonic timestamp, so one cannot be shared across two video sources.
    [landmarker, refLandmarker] = await Promise.all([createLandmarker(), createLandmarker()]);
}

/* =========================================================
   SYNCHRONIZATION ANALYSIS
   Compares the learner's pose with the pose in the Practice Video
   Editor. Scores are smoothed so the numbers do not jitter.
   ========================================================= */

// Torso-and-limb joints: the parts that actually describe a dance shape.
const SCORED_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const SMOOTHING = 0.12;         // how fast displayed scores chase the live value
const MIN_VISIBILITY = 0.4;     // ignore joints the model is unsure about

const sync = { score: 0, timing: 0, align: 0, energy: 0 };
let prevCamPose = null;
let prevRefPose = null;
let camMotion = 0;
let refMotion = 0;

function resetSync() {
    sync.score = sync.timing = sync.align = sync.energy = 0;
    prevCamPose = prevRefPose = null;
    camMotion = refMotion = 0;
    renderSync('Start the Live Pose Mirror to begin analysis');
}

/* Shoulder-to-hip distance, used to scale a pose to a common size so
   that standing closer to the camera does not change the score. */
function torsoSpan(pose) {
    const shoulder = { x: (pose[11].x + pose[12].x) / 2, y: (pose[11].y + pose[12].y) / 2 };
    const hip = { x: (pose[23].x + pose[24].x) / 2, y: (pose[23].y + pose[24].y) / 2 };
    return Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y) || 1;
}

/* Re-centre a pose on its hips and divide by torso span, so two
   dancers of different sizes standing in different spots compare. */
function normalizePose(pose, flip) {
    const originX = (pose[23].x + pose[24].x) / 2;
    const originY = (pose[23].y + pose[24].y) / 2;
    const span = torsoSpan(pose);
    return pose.map(p => ({
        x: ((flip ? -(p.x - originX) : (p.x - originX))) / span,
        y: (p.y - originY) / span,
        visibility: p.visibility ?? 1
    }));
}

/* Mean distance a pose travelled since the previous frame = how much energy it has. */
function poseMotion(pose, prev) {
    if (!prev) return 0;
    let sum = 0, n = 0;
    for (const j of SCORED_JOINTS) {
        if (pose[j].visibility < MIN_VISIBILITY || prev[j].visibility < MIN_VISIBILITY) continue;
        sum += Math.hypot(pose[j].x - prev[j].x, pose[j].y - prev[j].y);
        n++;
    }
    return n ? sum / n : 0;
}

/* Mean joint-to-joint distance between the two poses = how well the shapes line up. */
function poseAlignment(a, b) {
    let sum = 0, n = 0;
    for (const j of SCORED_JOINTS) {
        if (a[j].visibility < MIN_VISIBILITY || b[j].visibility < MIN_VISIBILITY) continue;
        sum += Math.hypot(a[j].x - b[j].x, a[j].y - b[j].y);
        n++;
    }
    if (!n) return null;
    // A mean offset of one torso length counts as completely out of sync.
    return Math.max(0, 1 - (sum / n));
}

function approach(current, target) {
    return current + (target - current) * SMOOTHING;
}

function updateSync(camPose, refPose, refMirrored) {
    // No readable reference pose: hold at 0 rather than inventing a score.
    if (!camPose || !refPose) return;

    const camNorm = normalizePose(camPose, true);              // webcam is a selfie view
    const refNorm = normalizePose(refPose, refMirrored);

    camMotion = approach(camMotion, poseMotion(camNorm, prevCamPose));
    refMotion = approach(refMotion, poseMotion(refNorm, prevRefPose));
    prevCamPose = camNorm;
    prevRefPose = refNorm;

    const align = poseAlignment(camNorm, refNorm);
    if (align === null) return;                                // body not fully in frame yet

    // Timing: are both dancers moving and pausing at the same moments?
    const peak = Math.max(camMotion, refMotion);
    const timing = peak < 1e-4 ? 1 : 1 - Math.abs(camMotion - refMotion) / peak;

    // Energy: is the learner putting in as much movement as the reference?
    const energy = refMotion < 1e-4
        ? (camMotion < 1e-4 ? 1 : 0)
        : Math.min(1, camMotion / refMotion);

    sync.align = approach(sync.align, align);
    sync.timing = approach(sync.timing, timing);
    sync.energy = approach(sync.energy, energy);
    // Alignment matters most, then timing, then energy.
    sync.score = approach(sync.score, align * 0.5 + timing * 0.3 + energy * 0.2);
}

function verdictFor(pct) {
    if (pct >= 85) return 'High Synchronization & Crisp Beats';
    if (pct >= 70) return 'Good Synchronization - keep tightening the beats';
    if (pct >= 45) return 'Getting there - watch the reference timing';
    return 'Out of sync - slow the video down and try again';
}

function pct(v) { return Math.round(Math.max(0, Math.min(1, v)) * 100); }

function renderSync(message) {
    const score = pct(sync.score);
    if (syncScore) syncScore.textContent = score + '%';
    if (syncDial) {
        syncDial.style.background =
            `conic-gradient(var(--pink, #f8b8d8) 0% ${score}%, rgba(255,255,255,0.1) ${score}% 100%)`;
    }
    if (syncTiming) syncTiming.textContent = pct(sync.timing) + '%';
    if (syncAlign) syncAlign.textContent = pct(sync.align) + '%';
    if (syncEnergy) syncEnergy.textContent = pct(sync.energy) + '%';
    if (syncVerdict) syncVerdict.textContent = message ?? verdictFor(score);
}

/* =========================================================
   CAMERA START / STOP
   ========================================================= */
function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
}

async function startCamera() {
    if (!startBtn) return;
    startBtn.disabled = true;
    try {
        await loadModels();
        stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 960, height: 720 },
            audio: false
        });
        camVideo.srcObject = stream;
        await camVideo.play();
        camCanvas.width = camVideo.videoWidth;
        camCanvas.height = camVideo.videoHeight;
        frame?.classList.add('live');
        if (placeholder) placeholder.style.display = 'none';
        if (badge) badge.textContent = 'LIVE';
        stopBtn.disabled = false;
        if (recBtn) recBtn.disabled = false;
        running = true;
        lastCamTime = lastRefTime = -1;
        setStatus('Move back until your whole body is in the frame.');
        renderSync('Analyzing - play the practice video to compare.');
        loop();
    } catch (err) {
        console.error(err);
        startBtn.disabled = false;
        setStatus('Could not start the camera: ' + (err.message || err) +
            ' (camera needs https or localhost and your permission).');
    }
}

function stopCamera() {
    if (isRecording()) stopRecording();     // never lose a take on an abrupt stop
    running = false;
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    if (camVideo) camVideo.srcObject = null;
    ctx?.clearRect(0, 0, camCanvas.width, camCanvas.height);
    frame?.classList.remove('live');
    if (placeholder) placeholder.style.display = '';
    if (badge) badge.textContent = 'OFF';
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (recBtn) recBtn.disabled = true;
    setStatus('Camera stopped.');
    resetSync();                            // analyzer goes back to 0 when the camera is off
}

/* =========================================================
   FRAME LOOP: draw the skeleton and feed the analyzer
   ========================================================= */
/* Returns the pose for a freshly arrived frame, `null` when a new frame
   held no detectable body, or `undefined` when the frame has not changed
   yet (nothing to redraw). */
function detectCamPose() {
    if (!landmarker || camVideo.currentTime === lastCamTime) return undefined;
    lastCamTime = camVideo.currentTime;
    const res = landmarker.detectForVideo(camVideo, performance.now());
    return res.landmarks?.[0] || null;
}

/* The reference pose comes from the Practice Video Editor. It is only
   available for uploaded/local files - YouTube, TikTok and Instagram
   play inside a cross-origin iframe whose pixels cannot be read. */
function detectRefPose() {
    const editor = window.MUSE?.videoEditor;
    const refVideo = editor?.getReferenceVideo?.();
    if (!refVideo || !refLandmarker || !editor.isPlaying()) return null;
    if (refVideo.currentTime === lastRefTime) return null;
    lastRefTime = refVideo.currentTime;
    const res = refLandmarker.detectForVideo(refVideo, performance.now());
    return res.landmarks?.[0] || null;
}

function drawSkeleton(pose) {
    ctx.clearRect(0, 0, camCanvas.width, camCanvas.height);
    if (!pose || !showSkeleton || !drawUtils) return;
    drawUtils.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, { color: '#c4b0ff', lineWidth: 4 });
    drawUtils.drawLandmarks(pose, { color: '#f8b8d8', fillColor: '#f8b8d8', radius: 4 });
}

function loop() {
    if (!running) return;

    const camPose = detectCamPose();

    if (camPose !== undefined) {            // a new camera frame arrived
        if (badge) {
            badge.textContent = isRecording() ? 'REC' : (camPose ? 'TRACKING' : 'LIVE');
        }
        drawSkeleton(camPose);

        if (camPose) {
            const editor = window.MUSE?.videoEditor;
            const refPose = detectRefPose();
            if (refPose) {
                updateSync(camPose, refPose, editor?.isMirrored?.());
                renderSync();
            } else if (!editor?.getReferenceVideo?.()) {
                renderSync('Upload a dance video in the editor to compare poses.');
            }
        }
    }

    if (isRecording()) updateRecTimer();
    requestAnimationFrame(loop);
}

/* =========================================================
   RECORDING
   Saves the take as a file the browser can play back, adds it to
   the Gallery and offers it as a download.
   ========================================================= */
function pickMimeType() {
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    return candidates.find(t => MediaRecorder.isTypeSupported?.(t)) || '';
}

function isRecording() {
    return recorder?.state === 'recording';
}

function setRecButton(on) {
    if (!recBtn) return;
    recBtn.textContent = on ? '■ Stop Recording' : '● Record';
    recBtn.classList.toggle('active-btn', on);
}

function updateRecTimer() {
    const secs = Math.floor((performance.now() - recStartedAt) / 1000);
    setStatus('Recording... ' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'));
}

function startRecording() {
    if (!stream || isRecording()) return;
    if (typeof MediaRecorder === 'undefined') {
        setStatus('This browser cannot record video (MediaRecorder is not supported).');
        return;
    }
    recordedChunks = [];
    const mimeType = pickMimeType();
    try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (err) {
        console.error(err);
        setStatus('Could not start recording: ' + (err.message || err));
        return;
    }
    recorder.addEventListener('dataavailable', e => { if (e.data.size) recordedChunks.push(e.data); });
    recorder.addEventListener('stop', saveRecording);
    recorder.addEventListener('error', e => {
        console.error(e.error || e);
        setStatus('Recording stopped because of an error: ' + (e.error?.message || 'unknown error'));
        setRecButton(false);
    });
    recorder.start(1000);           // flush every second so a long take is not held in one blob
    recStartedAt = performance.now();
    setRecButton(true);
    if (badge) badge.textContent = 'REC';
}

function stopRecording() {
    if (isRecording()) recorder.stop();   // 'stop' handler does the saving
    setRecButton(false);
}

function saveRecording() {
    const type = recorder?.mimeType || 'video/webm';
    recorder = null;

    if (!recordedChunks.length) {
        setStatus('Nothing was recorded. Try again.');
        return;
    }

    const blob = new Blob(recordedChunks, { type });
    recordedChunks = [];
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const name = 'MUSE-practice-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + ext;

    // Put it in the Gallery first, so the take is never lost even if
    // the browser blocks or the user cancels the download.
    const addedToGallery = window.MUSE?.gallery?.addRecording?.(blob, name);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    // The Gallery keeps its own object URL, so this one can be released.
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    setStatus(addedToGallery
        ? 'Saved ' + name + ' to your device and added it to the Gallery.'
        : 'Saved ' + name + ' to your device.');
    if (badge && running) badge.textContent = 'LIVE';
}

/* =========================================================
   WIRE UP THE CONTROLS
   ========================================================= */
startBtn?.addEventListener('click', startCamera);
stopBtn?.addEventListener('click', stopCamera);
recBtn?.addEventListener('click', () => {
    if (isRecording()) stopRecording(); else startRecording();
});
skelBtn?.addEventListener('click', () => {
    showSkeleton = !showSkeleton;
    skelBtn.textContent = 'Skeleton: ' + (showSkeleton ? 'On' : 'Off');
    skelBtn.classList.toggle('active-btn', showSkeleton);
});

// Releasing the camera on unload keeps the webcam light from staying on.
window.addEventListener('pagehide', () => { if (running) stopCamera(); });

/* ---------- Initial state: analyzer shows 0 ---------- */
resetSync();

})();
