/* =========================================================
   LIVE POSE MIRROR
   Every control of the "Live Pose Mirror" card lives in this file:
   the webcam stream, the MediaPipe pose overlay and the Record button
   that saves a take into the Gallery.

   Every camera pose is also handed to pose-sync.js (window.MUSE.sync),
   which compares it with the practice video's skeleton and fills in the
   "AI Synchronization Analyzer" card.

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

    const ctx = camCanvas?.getContext('2d');
    let drawUtils = null;   // built once DrawingUtils has been imported

    /* ---------- Camera / pose state ---------- */
    let landmarker = null;      // pose model for the webcam
    let stream = null;
    let running = false;
    let showSkeleton = true;
    let lastCamTime = -1;

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
        // The practice video has its own model in pose-sync.js
        landmarker = await createLandmarker();
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
            lastCamTime = -1;
            setStatus('Move back until your whole body is in the frame.');
            document.dispatchEvent(new Event('muse:camerastart'));   // pose-sync.js stops a recording analysis
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
    }

    /* =========================================================
       FRAME LOOP: draw the skeleton and feed the analyzer
       ========================================================= */
    /* Returns the detection result for a freshly arrived frame, or `undefined`
       when the frame has not changed yet (nothing to redraw). */
    function detectCamPose() {
        if (!landmarker || camVideo.currentTime === lastCamTime) return undefined;
        lastCamTime = camVideo.currentTime;
        return landmarker.detectForVideo(camVideo, performance.now());
    }

    function drawSkeleton(pose) {
        ctx.clearRect(0, 0, camCanvas.width, camCanvas.height);
        if (!pose || !showSkeleton || !drawUtils) return;
        drawUtils.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, { color: '#c4b0ff', lineWidth: 4 });
        drawUtils.drawLandmarks(pose, { color: '#f8b8d8', fillColor: '#f8b8d8', radius: 4 });
    }

    function loop() {
        if (!running) return;

        const res = detectCamPose();

        if (res !== undefined) {                // a new camera frame arrived
            const camPose = res.landmarks?.[0] || null;
            if (badge) {
                badge.textContent = isRecording() ? 'REC' : (camPose ? 'TRACKING' : 'LIVE');
            }
            drawSkeleton(camPose);
            window.MUSE?.sync?.addCam(res);     // pose-sync.js compares it with the practice video
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

    /* pose-sync.js asks whether the camera is on (for its hints and the live score) */
    window.MUSE = window.MUSE || {};
    window.MUSE.camera = {
        isRunning: () => running,
        stop: () => {
            if (running) stopCamera();
        }
    };

})();
