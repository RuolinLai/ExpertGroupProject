/* =========================================================
   SKELETON ON THE PRACTICE VIDEO + AI SYNCHRONIZATION ANALYZER
   - Draws the MediaPipe skeleton on the practice video (uploaded file,
     or a YouTube / TikTok / Instagram link through tab capture).
   - Compares that skeleton with your camera skeleton (camera.js hands
     every camera pose to window.MUSE.sync.addCam) and fills in the live
     score on the camera and the report in the Analyzer card.

   Like camera.js this is a CLASSIC script that pulls MediaPipe in with
   a dynamic import(), so it also works when the page is opened
   straight from disk (file://).
   ========================================================= */
(async function () {
    'use strict';

    let PoseLandmarker, FilesetResolver, DrawingUtils;
    try {
        ({ PoseLandmarker, FilesetResolver, DrawingUtils } =
            await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'));
    } catch (err) {
        console.error('Could not load MediaPipe', err);   // video-editor.js explains it when Skeleton is pressed
        return;
    }
    window.__museMediaPipeReady = true;

    /* is the camera on? (camera.js owns the camera) */
    const camRunning = () => !!window.MUSE?.camera?.isRunning?.();

    /* =========================================================
       SKELETON ON THE PRACTICE VIDEO
       - uploaded / local file : drawn directly over the <video>
       - YouTube / TikTok / Instagram link : the browser captures this tab's
         player area (Region Capture), MediaPipe analyses the captured frames
         and the result is shown in the "Pose view" panel.
       Uses its own PoseLandmarker so it never fights with the camera one.
       ========================================================= */
    const vpVideo = document.getElementById('danceVideo');
    const vpOverlay = document.getElementById('poseOverlay');
    const vpBtn = document.getElementById('vidSkelBtn');
    const vpStatusEl = document.getElementById('vidPoseStatus');
    const vpCtx = vpOverlay.getContext('2d');
    const vpView = document.getElementById('poseView');
    const vpViewCanvas = document.getElementById('poseViewCanvas');
    const vpViewCtx = vpViewCanvas.getContext('2d');
    const vpCap = document.getElementById('capVideo');
    const vpEmbedStage = document.getElementById('embedStage');
    const vpCapOverlay = document.getElementById('poseCapOverlay');
    const vpCapCtx = vpCapOverlay.getContext('2d');
    let vpCapKind = 'element';             // 'element' = skeleton on the video, 'region' = separate Pose view
    const VP_HINT = 'Upload a dance video: the dancer is tracked automatically. Skeleton On / Off only shows or hides it.';
    const VP_LINK_HINT = 'Links: press Skeleton once, then choose \u201cThis tab\u201d and Share in the window your browser shows (browsers only allow this after a click). Needs Chrome or Edge 132+ on a computer.';
    const VP_COLORS = [['#c4b0ff', '#f8b8d8'], ['#8fe3d0', '#ffe08a']];   // line / dot colours per person
    let vpLandmarker = null, vpLoading = null;
    let vpOn = false, vpGen = 0, vpMode = 'file';   // vpOn = tracking the dancer (runs in the background)
    let vpShow = false;                    // draw the skeleton on screen? (the Skeleton button)
    let vpStarting = false;
    let vpSource = 'none';                 // 'file' | 'capture'
    let vpStream = null;
    let vpLastT = -1, vpLastTs = 0, vpLastCount = -1;

    /* --- keeping the skeleton in time with the picture --- */
    let vpPoses = 1;                       // 1 dancer is faster; the "Dancers" button switches to 2
    let vpDelegate = 'GPU';
    let vpInferMs = 15;                    // moving average of how long one detection takes
    let vpTrack = [];                      // previous detection per person (used to estimate speed)
    let vpLeadMs = { file: 0, capture: 80 };   // extra look-ahead, adjustable with the slider
    let vpLayoutKey = '', vpCapLayoutKey = '';
    let vpViewPoses = null;                // last skeleton shown in the Pose view
    const vpLeadSlider = document.getElementById('vpLead');
    const vpLeadVal = document.getElementById('vpLeadVal');
    const vpPosesBtn = document.getElementById('vpPosesBtn');
    try {
        const saved = JSON.parse(localStorage.getItem('muse.vpLead') || 'null');
        if (saved && typeof saved.file === 'number' && typeof saved.capture === 'number') vpLeadMs = saved;
    } catch (e) { /* storage not available: keep defaults */ }

    function vpLeadKind() { return vpSource !== 'none' ? vpSource : (vpMode === 'file' ? 'file' : 'capture'); }
    function vpSyncSlider() {
        const v = vpLeadMs[vpLeadKind()];
        vpLeadSlider.value = v;
        vpLeadVal.textContent = v + ' ms';
    }
    vpLeadSlider.addEventListener('input', () => {
        vpLeadMs[vpLeadKind()] = Number(vpLeadSlider.value);
        vpLeadVal.textContent = vpLeadSlider.value + ' ms';
        try { localStorage.setItem('muse.vpLead', JSON.stringify(vpLeadMs)); } catch (e) { }
    });
    vpPosesBtn.addEventListener('click', async () => {
        vpPoses = vpPoses === 1 ? 2 : 1;
        vpPosesBtn.textContent = 'Dancers: ' + vpPoses;
        vpTrack = [];
        if (vpWorker) vpWorker.postMessage({ type: 'poses', numPoses: vpPoses });
        if (vpLandmarker) { try { await vpLandmarker.setOptions({ numPoses: vpPoses }); } catch (e) { console.warn(e); } }
    });
    function vpStartNote() {
        return vpDelegate === 'CPU' ? ' (Running on CPU, so it may lag. Turn on hardware acceleration in your browser settings.)' : '';
    }

    /* Every detection is already a little old when it is drawn (the model needs time, the screen needs
       another refresh, and a captured tab adds its own delay). So we estimate each joint's speed from the
       last two detections and draw it slightly ahead in time. */
    function vpHip(lm) {
        const a = lm[23], b = lm[24];
        return a && b ? [(a.x + b.x) / 2, (a.y + b.y) / 2] : [lm[0].x, lm[0].y];
    }
    function vpExtrapolate(landmarks, clock, leadSec) {
        const prev = vpTrack, next = [];
        const used = new Set();
        const out = landmarks.map(lm => {
            const hip = vpHip(lm);
            let best = -1, bestD = 0.15;                 // match this person with the nearest one from the last frame
            prev.forEach((p, j) => {
                if (used.has(j)) return;
                const d = Math.hypot(p.hip[0] - hip[0], p.hip[1] - hip[1]);
                if (d < bestD) { bestD = d; best = j; }
            });
            let vel = null;
            if (best >= 0) {
                used.add(best);
                const p = prev[best];
                const dt = clock - p.clock;
                if (dt > 0.004 && dt < 0.25 && p.lm.length === lm.length) {   // seeks / pauses / gaps: don't predict
                    vel = lm.map((pt, k) => {
                        const vx = (pt.x - p.lm[k].x) / dt, vy = (pt.y - p.lm[k].y) / dt;
                        const o = p.vel ? p.vel[k] : null;
                        return o ? [0.6 * vx + 0.4 * o[0], 0.6 * vy + 0.4 * o[1]] : [vx, vy];   // light smoothing
                    });
                }
            }
            next.push({ hip, lm, clock, vel });
            if (!vel || leadSec <= 0) return lm;
            const lead = Math.min(leadSec, 0.4);
            const clamp = v => Math.max(-0.1, Math.min(0.1, v));            // never jump more than 10% of the picture
            const dead = v => (Math.abs(v) < 0.04 ? 0 : v);                 // ignore tiny jitter
            return lm.map((pt, k) => Object.assign({}, pt, {
                x: pt.x + clamp(dead(vel[k][0]) * lead),
                y: pt.y + clamp(dead(vel[k][1]) * lead)
            }));
        });
        vpTrack = next;
        return out;
    }

    function vpSetStatus(msg, isError) {
        vpStatusEl.textContent = msg;
        vpStatusEl.classList.toggle('error', !!isError);
    }
    function vpIdleHint() { return vpMode === 'file' ? VP_HINT : VP_LINK_HINT; }

    function vpUpdateBtn() {
        vpBtn.textContent = 'Skeleton: ' + (vpShow ? 'On' : 'Off');
        vpBtn.classList.toggle('active-btn', vpShow);
        vpSyncSlider();
    }

    /* The model only looks at a ~256px picture, so give it a small copy of the frame instead of the
       full 1080p / 4K video: far less to send to the GPU every frame, so playback stays smooth. */
    const VP_INPUT = 512;
    const vpSmall = document.createElement('canvas');
    const vpSmallCtx = vpSmall.getContext('2d');
    function vpShrink(src, w, h) {
        const s = Math.min(1, VP_INPUT / Math.max(w, h));
        const cw = Math.round(w * s), ch = Math.round(h * s);
        if (vpSmall.width !== cw || vpSmall.height !== ch) { vpSmall.width = cw; vpSmall.height = ch; }
        vpSmallCtx.drawImage(src, 0, 0, cw, ch);
        return vpSmall;
    }

    /* The first detections compile the GPU shaders and can freeze the page for a second.
       Do that once right after loading, on a blank picture, instead of during playback. */
    function vpWarmUp(lm) {
        const c = document.createElement('canvas');
        c.width = VP_INPUT; c.height = VP_INPUT;
        c.getContext('2d').fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < 3; i++) lm.detectForVideo(c, vpNextTs());
    }

    const VP_MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
    const VP_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

    /* The model runs in a background thread (Web Worker). On the page itself every detection made
       the video wait for it, so playback stuttered while the skeleton was on.
       If the worker can't start, the model runs on the page as before. */
    const VP_WORKER_SRC = `
        var exports = {};
        // the CDN sends .cjs files as "application/node", which importScripts refuses, so load it as text
        const lib = fetch('${VP_MP}/vision_bundle.cjs').then(r => r.text())
            .then(code => importScripts(URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))));
        let lm = null;
        onmessage = async e => {
            const m = e.data;
            if (m.type === 'init') {
                try {
                    await lib;
                    const fileset = await exports.FilesetResolver.forVisionTasks('${VP_MP}/wasm');
                    const make = delegate => exports.PoseLandmarker.createFromOptions(fileset, {
                        baseOptions: { modelAssetPath: '${VP_MODEL}', delegate },
                        runningMode: 'VIDEO', numPoses: m.numPoses
                    });
                    let delegate = 'GPU';
                    try { lm = await make('GPU'); } catch (err) { delegate = 'CPU'; lm = await make('CPU'); }
                    const c = new OffscreenCanvas(m.size, m.size);      // warm-up, see vpWarmUp
                    c.getContext('2d').fillRect(0, 0, m.size, m.size);
                    for (let i = 0; i < 3; i++) lm.detectForVideo(c, m.ts + i);
                    postMessage({ type: 'ready', delegate });
                } catch (err) { postMessage({ type: 'error', message: String(err && err.message || err) }); }
            } else if (m.type === 'poses') {
                if (lm) await lm.setOptions({ numPoses: m.numPoses });
            } else if (m.type === 'frame') {
                let res = null, error = null;
                try { res = lm.detectForVideo(m.bitmap, m.ts); } catch (err) { error = String(err && err.message || err); }
                m.bitmap.close();
                postMessage({ type: 'result', error,
                    landmarks: res ? res.landmarks : [], worldLandmarks: res ? res.worldLandmarks : [] });
            }
        };`;
    let vpWorker = null, vpJob = null, vpWanted = false;   // vpJob = the frame the worker is busy with

    function vpStartWorker() {
        return new Promise((resolve, reject) => {
            let w;
            try { w = new Worker(URL.createObjectURL(new Blob([VP_WORKER_SRC], { type: 'text/javascript' }))); }
            catch (e) { reject(e); return; }
            const ts = vpNextTs();
            vpLastTs = ts + 3;                           // the warm-up uses ts .. ts+2
            w.onmessage = e => {
                const m = e.data;
                if (m.type === 'ready') {
                    vpDelegate = m.delegate;
                    w.onmessage = ev => vpOnResult(ev.data);
                    w.onerror = ev => {                  // crashed mid-way: report it instead of freezing the skeleton
                        ev.preventDefault();
                        const job = vpJob; vpJob = null;
                        if (job && job.gen === vpGen && vpOn) job.onError(new Error(ev.message || 'pose worker stopped'));
                    };
                    resolve(w);
                }
                else if (m.type === 'error') { w.terminate(); reject(new Error(m.message)); }
            };
            w.onerror = e => { e.preventDefault(); w.terminate(); reject(new Error(e.message || 'worker failed')); };
            w.postMessage({ type: 'init', numPoses: vpPoses, size: VP_INPUT, ts });
        });
    }

    async function vpLoadModel() {
        if (vpWorker || vpLandmarker) return;
        if (!vpLoading) {
            vpLoading = (async () => {
                try { vpWorker = await vpStartWorker(); return; }
                catch (e) { console.warn('Pose worker unavailable, running the model on the page instead', e); }
                const fileset = await FilesetResolver.forVisionTasks(VP_MP + "/wasm");
                const make = delegate => PoseLandmarker.createFromOptions(fileset, {
                    baseOptions: { modelAssetPath: VP_MODEL, delegate },
                    runningMode: "VIDEO",
                    numPoses: vpPoses     // 1 is faster; use the Dancers button for 2
                });
                try { vpLandmarker = await make('GPU'); vpDelegate = 'GPU'; }
                catch (e) { console.warn('GPU delegate failed, using CPU instead', e); vpLandmarker = await make('CPU'); vpDelegate = 'CPU'; }
                try { vpWarmUp(vpLandmarker); } catch (e) { console.warn('Pose model warm-up failed', e); }
            })().catch(err => { vpLoading = null; throw err; });
        }
        return vpLoading;
    }
    const vpReady = () => !!(vpWorker || vpLandmarker);

    /* Detect the pose in one frame, then call show(res). With the worker the result arrives later;
       while it is busy, newer frames are skipped and the latest one is analysed next. */
    function vpRun(src, w, h, show, onError) {
        if (!vpWorker) {
            const t0 = performance.now();
            let res;
            try { res = vpLandmarker.detectForVideo(vpShrink(src, w, h), vpNextTs()); }
            catch (err) { onError(err); return; }
            vpInferMs = vpInferMs * 0.9 + Math.min(100, performance.now() - t0) * 0.1;   // one slow frame must not skew it
            show(res);
            return;
        }
        if (vpJob) { vpWanted = true; return; }
        const s = Math.min(1, VP_INPUT / Math.max(w, h));
        const size = { resizeWidth: Math.round(w * s), resizeHeight: Math.round(h * s), resizeQuality: 'low' };
        const job = vpJob = { show, onError, gen: vpGen, sent: performance.now() };
        createImageBitmap(src, size)
            .catch(() => createImageBitmap(vpShrink(src, w, h)))
            .then(bitmap => {
                if (vpJob !== job) { bitmap.close(); return; }
                vpWorker.postMessage({ type: 'frame', bitmap, ts: vpNextTs() }, [bitmap]);
            })
            .catch(err => { if (vpJob === job) { vpJob = null; onError(err); } });
    }

    function vpOnResult(m) {
        const job = vpJob;
        vpJob = null;
        if (!job || job.gen !== vpGen || !vpOn) { vpWanted = false; return; }
        if (m.error) { job.onError(new Error(m.error)); return; }
        // time from grabbing the frame to having its result (the picture has moved on by this much)
        vpInferMs = vpInferMs * 0.9 + Math.min(100, performance.now() - job.sent) * 0.1;
        job.show(m);
        if (vpWanted) {                                  // a newer frame came in meanwhile: analyse it now
            vpWanted = false;
            if (vpSource === 'capture') vpDetectCap(); else vpDetect(false);
        }
    }

    function vpDrawPoses(ctx, w, poses) {
        const du = new DrawingUtils(ctx);
        const lw = Math.max(2, w / 180);
        poses.forEach((lm, i) => {
            const [line, dot] = VP_COLORS[i % VP_COLORS.length];
            du.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: line, lineWidth: lw });
            du.drawLandmarks(lm, { color: dot, fillColor: dot, radius: lw * 0.9 });
        });
    }

    function vpReport(count) {
        if (count === vpLastCount) return;               // only touch the DOM when it changes
        vpLastCount = count;
        vpSetStatus(count
            ? 'Tracking ' + count + (count === 1 ? ' dancer.' : ' dancers.')
            : 'No person found in this frame. Make sure the whole body is visible.');
    }

    function vpNextTs() {
        const ts = Math.max(performance.now(), vpLastTs + 1);   // must always increase
        vpLastTs = ts;
        return ts;
    }

    function vpFail(prefix, err) {
        console.error(err);
        vpTurnOff();
        vpSetStatus(prefix + (err && err.message ? err.message : err), true);
    }

    /* ---------- A) local / uploaded file: skeleton directly on the <video> ---------- */

    /* Put the canvas exactly on top of the picture (the <video> is letterboxed by object-fit: contain) */
    function vpLayout() {
        const vw = vpVideo.videoWidth, vh = vpVideo.videoHeight;
        if (!vw || !vh) return;
        const bw = vpVideo.clientWidth, bh = vpVideo.clientHeight;
        const key = [vw, vh, bw, bh, vpVideo.offsetLeft, vpVideo.offsetTop].join();
        if (key === vpLayoutKey) return;                 // nothing moved: avoid forcing a re-layout every frame
        vpLayoutKey = key;
        const scale = Math.min(bw / vw, bh / vh);
        const w = vw * scale, h = vh * scale;
        vpOverlay.style.width = w + 'px';
        vpOverlay.style.height = h + 'px';
        vpOverlay.style.left = (vpVideo.offsetLeft + (bw - w) / 2) + 'px';
        vpOverlay.style.top = (vpVideo.offsetTop + (bh - h) / 2) + 'px';
        const cw = Math.min(vw, 960), ch = Math.round(cw * vh / vw);   // drawing resolution
        if (vpOverlay.width !== cw || vpOverlay.height !== ch) { vpOverlay.width = cw; vpOverlay.height = ch; }
    }

    function vpClear() { vpCtx.clearRect(0, 0, vpOverlay.width, vpOverlay.height); }

    function vpDetect(force) {
        if (!vpOn || vpSource !== 'file' || !vpReady() || vpMode !== 'file') return;
        if (vpVideo.readyState < 2 || !vpVideo.videoWidth) return;
        const t = vpVideo.currentTime;
        if (!force && t === vpLastT) return;          // same frame as last time
        if (vpJob) { vpWanted = true; return; }       // worker still busy: analyse the newest frame when it is done
        vpLastT = t;
        vpLayout();
        vpRun(vpVideo, vpVideo.videoWidth, vpVideo.videoHeight, res => {
            if (vpSource !== 'file') return;
            // look ahead by: detection time + one screen refresh + the slider; in video time, so 0.5x speed works too
            const rate = vpVideo.paused ? 0 : vpVideo.playbackRate;
            const leadSec = (vpInferMs + 16 + vpLeadMs.file) / 1000 * rate;
            const poses = vpExtrapolate(res.landmarks, t, leadSec);
            syncAddRef(res);
            vpClear();
            if (vpShow) vpDrawPoses(vpCtx, vpOverlay.width, poses);
            vpReport(res.landmarks.length);
        }, err => vpFail('Could not analyse this video: ', err));
    }

    /* Starts by itself as soon as a video is loaded; the Skeleton button only shows / hides the drawing */
    async function vpStartFile() {
        if (vpOn || vpStarting || vpMode !== 'file') return;
        if (vpVideo.readyState < 2 || !vpVideo.videoWidth) return;   // no video yet
        vpStarting = true;
        vpSetStatus('Loading pose model...');
        try {
            await vpLoadModel();
        } catch (err) {
            console.error(err);
            vpSetStatus('Could not load the pose model: ' + (err.message || err) + ' (it needs an internet connection). Press Skeleton to try again.', true);
            return;
        } finally {
            vpStarting = false;
        }
        if (vpMode !== 'file' || vpOn) return;           // user switched to a link while loading
        vpOn = true; vpSource = 'file';
        vpLastT = -1; vpLastCount = -1;
        vpUpdateBtn();
        vpOverlay.hidden = !vpShow;
        vpSetStatus('Tracking the dancer in the background. Skeleton On shows it on the video.' + vpStartNote());
        vpLayout();
        vpDetect(true);                                  // draw the current frame even if paused
        vpLoop(++vpGen);
    }

    /* ---------- B) YouTube / TikTok / Instagram: capture the player area of this tab ---------- */

    /* Cover the player (#embedStage) exactly with the skeleton canvas */
    function vpLayoutCap(cw, ch) {
        const key = [cw, ch, vpEmbedStage.offsetLeft, vpEmbedStage.offsetTop, vpEmbedStage.clientWidth, vpEmbedStage.clientHeight].join();
        if (key === vpCapLayoutKey) return;              // nothing moved: avoid forcing a re-layout every frame
        vpCapLayoutKey = key;
        vpCapOverlay.style.left = vpEmbedStage.offsetLeft + 'px';
        vpCapOverlay.style.top = vpEmbedStage.offsetTop + 'px';
        vpCapOverlay.style.width = vpEmbedStage.clientWidth + 'px';
        vpCapOverlay.style.height = vpEmbedStage.clientHeight + 'px';
        if (vpCapOverlay.width !== cw || vpCapOverlay.height !== ch) { vpCapOverlay.width = cw; vpCapOverlay.height = ch; }
    }

    function vpDetectCap() {
        if (!vpOn || vpSource !== 'capture' || !vpReady()) return;
        const w0 = vpCap.videoWidth, h0 = vpCap.videoHeight;
        if (!w0 || !h0 || vpCap.readyState < 2) return;
        const cw = Math.min(w0, 960), ch = Math.round(cw * h0 / w0);
        const onVideo = (vpCapKind === 'element');
        if (!onVideo && vpShow) {                        // fallback: show the captured picture in the Pose view
            if (vpViewCanvas.width !== cw || vpViewCanvas.height !== ch) { vpViewCanvas.width = cw; vpViewCanvas.height = ch; }
            vpViewCtx.drawImage(vpCap, 0, 0, cw, ch);
            if (vpViewPoses) vpDrawPoses(vpViewCtx, cw, vpViewPoses);   // keep the last skeleton on the new picture
        }
        if (vpJob) { vpWanted = true; return; }
        const t0 = performance.now();
        vpRun(vpCap, w0, h0, res => {
            if (vpSource !== 'capture') return;
            // a captured tab arrives late too, so the slider adds extra look-ahead on top of the detection time
            const leadSec = (vpInferMs + 16 + vpLeadMs.capture) / 1000;
            const poses = vpExtrapolate(res.landmarks, t0 / 1000, leadSec);
            syncAddRef(res);
            vpViewPoses = poses;
            if (!vpShow) {
                // tracked for the analyzer, nothing drawn
            } else if (onVideo) {                        // skeleton directly on the original player
                vpLayoutCap(cw, ch);
                vpCapCtx.clearRect(0, 0, vpCapOverlay.width, vpCapOverlay.height);
                vpDrawPoses(vpCapCtx, cw, poses);
            } else {
                vpViewCtx.drawImage(vpCap, 0, 0, cw, ch);    // the newest picture, without the old skeleton
                vpDrawPoses(vpViewCtx, cw, poses);
            }
            vpReport(res.landmarks.length);
        }, err => vpFail('Could not analyse the captured video: ', err));
    }

    async function vpStartCapture() {
        const hasElement = !!(window.RestrictionTarget && RestrictionTarget.fromElement);   // Chrome / Edge 132+
        const hasRegion = !!(window.CropTarget && CropTarget.fromElement);                  // Chrome / Edge 104+
        const canCapture = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && (hasElement || hasRegion);
        if (!canCapture) {
            vpSetStatus('Skeleton for YouTube / TikTok / Instagram links needs Chrome or Edge on a computer (it uses screen capture of this tab). In other browsers, upload the video file instead.', true);
            return;
        }
        vpBtn.disabled = true;
        vpSetStatus('Choose \u201cThis tab\u201d in the sharing window and press Share...');
        let stream = null, kind = 'element';
        try {
            let elTarget = null, regionTarget = null;
            if (hasElement) { try { elTarget = await RestrictionTarget.fromElement(vpEmbedStage); } catch (e) { console.warn('Element Capture unavailable', e); } }
            if (hasRegion) { try { regionTarget = await CropTarget.fromElement(vpEmbedStage); } catch (e) { console.warn('Region Capture unavailable', e); } }
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 30 } },
                audio: false,
                preferCurrentTab: true,
                selfBrowserSurface: 'include'
            });
            const track = stream.getVideoTracks()[0];
            if (!track || (typeof track.restrictTo !== 'function' && typeof track.cropTo !== 'function')) {
                throw new Error('Please choose \u201cThis tab\u201d (not a window or the whole screen).');
            }
            let done = false;
            if (elTarget && typeof track.restrictTo === 'function') {
                // Element Capture: only the player's own pixels. Our skeleton canvas lies on top of it
                // but is NOT part of the player, so it never ends up in the captured frames.
                try { await track.restrictTo(elTarget); done = true; kind = 'element'; }
                catch (e) { console.warn('Element Capture failed, falling back to Region Capture', e); }
            }
            if (!done) {
                if (!regionTarget || typeof track.cropTo !== 'function') throw new Error('This browser cannot isolate the player area.');
                await track.cropTo(regionTarget);        // older Chrome: skeleton shown in the Pose view below
                kind = 'region';
            }
            track.addEventListener('ended', () => { if (vpStream === stream) vpTurnOff(); });   // "Stop sharing" button
        } catch (err) {
            if (stream) stream.getTracks().forEach(t => t.stop());
            vpBtn.disabled = false;
            vpSetStatus(err && err.name === 'NotAllowedError'
                ? 'Sharing was cancelled, so the skeleton could not start.'
                : 'Could not capture the player: ' + (err.message || err) + ' Choose \u201cThis tab\u201d in the sharing window.', true);
            return;
        }
        vpStream = stream;
        vpCapKind = kind;
        vpCap.srcObject = stream;
        vpCap.play().catch(() => {});

        vpSetStatus('Loading pose model...');
        try {
            await vpLoadModel();
        } catch (err) {
            console.error(err);
            vpBtn.disabled = false;
            vpTurnOff();
            vpSetStatus('Could not load the pose model: ' + (err.message || err) + ' (it needs an internet connection).', true);
            return;
        }
        vpBtn.disabled = false;
        if (vpMode === 'file' || vpStream !== stream) { vpTurnOff(); return; }   // switched to a file / stopped meanwhile
        vpOn = true; vpSource = 'capture';
        vpLastCount = -1;
        vpShow = true;                                   // the click that started the capture was "show me"
        vpApplyShow();
        vpSetStatus(kind === 'element'
            ? 'Tracking the linked video. Press play: the skeleton is drawn right on the video (Skeleton Off hides it, tracking keeps going).' + vpStartNote()
            : 'Tracking the linked video. Your browser is older than Chrome 132, so the skeleton is shown in the Pose view below (keep the video visible on screen). Update Chrome to draw it on the video itself.');
        vpLoop(++vpGen);
    }

    /* Show or hide the drawing; tracking (and the analyzer) keeps running either way */
    function vpApplyShow() {
        vpUpdateBtn();
        vpOverlay.hidden = !(vpShow && vpSource === 'file');
        vpCapOverlay.hidden = !(vpShow && vpSource === 'capture' && vpCapKind === 'element');
        vpView.hidden = !(vpShow && vpSource === 'capture' && vpCapKind === 'region');
        if (!vpShow) {
            vpClear();
            vpCapCtx.clearRect(0, 0, vpCapOverlay.width, vpCapOverlay.height);
        } else if (vpSource === 'file') {
            vpDetect(true);                              // draw the current frame right away, even if paused
        }
    }

    /* ---------- shared ---------- */

    function vpLoop(gen) {
        if (!vpOn || gen !== vpGen) return;
        const el = vpSource === 'capture' ? vpCap : vpVideo;
        const run = vpSource === 'capture' ? vpDetectCap : () => vpDetect(false);
        const cb = () => { if (gen !== vpGen) return; run(); vpLoop(gen); };
        if ('requestVideoFrameCallback' in el) el.requestVideoFrameCallback(cb);
        else requestAnimationFrame(cb);
    }

    function vpTurnOff() {
        vpOn = false;
        vpGen++;
        vpClear();
        vpOverlay.hidden = true;
        vpCapCtx.clearRect(0, 0, vpCapOverlay.width, vpCapOverlay.height);
        vpCapOverlay.hidden = true;
        if (vpStream) { vpStream.getTracks().forEach(t => t.stop()); vpStream = null; }
        vpCap.srcObject = null;
        vpView.hidden = true;
        vpSource = 'none';
        vpTrack = [];
        vpViewPoses = null;
        syncResetFraming();
        vpUpdateBtn();
        vpSetStatus(vpIdleHint());
    }

    vpBtn.addEventListener('click', () => {
        console.info('[MUSE skeleton] click | mode:', vpMode, '| on:', vpOn,
            '| screen capture API:', !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
            '| CropTarget:', !!window.CropTarget);
        // a link can only be tracked after the user shares the tab, and that needs this click
        if (vpMode !== 'file' && !vpOn) { vpStartCapture(); return; }
        vpShow = !vpShow;
        vpApplyShow();
        if (vpMode === 'file' && !vpOn) vpStartFile();   // e.g. the model failed to load earlier: try again
    });

    /* =========================================================
       AI SYNCHRONIZATION ANALYZER
       Compares the practice-video skeleton with your camera skeleton, live.
       A pose becomes the 3D direction of 9 body segments (world landmarks, so
       how far you stand from the camera and your body size do not matter).
       - Align  : how close your segment directions are to the dancer's
       - Timing : how far behind the dancer you are, found by matching your pose
                  against the dancer's poses from the last second
       - Energy : how big your movements are compared with the dancer's
       Mirror-style copying (your right arm = dancer's left arm) is detected automatically.
       The live score is shown on the camera (#syncHud); the Analyzer card below
       shows the report for the whole session.
       ========================================================= */
    const SYNC_SEGS = [                    // [body part, from, to]; 33 = mid shoulders, 34 = mid hips
        ['left arm', 11, 13], ['left arm', 13, 15], ['right arm', 12, 14], ['right arm', 14, 16],
        ['left leg', 23, 25], ['left leg', 25, 27], ['right leg', 24, 26], ['right leg', 26, 28],
        ['upper body', 34, 33]
    ];
    const SYNC_PARTS = ['left arm', 'right arm', 'left leg', 'right leg', 'upper body'];
    const SYNC_SWAP = [2, 3, 0, 1, 6, 7, 4, 5, 8];     // left <-> right partner of each segment
    const SYNC_WINDOW = 1000;              // ms of dancer history searched for your timing
    // how forgiving the score is (pose tracking is never exact, so a perfect copy still reads a little off)
    const SYNC_ANGLE_OK = 25;              // degrees off a segment can be and still get full marks
    const SYNC_ANGLE_ZERO = 100;           // degrees off where a segment gets 0
    const SYNC_LAG_OK = 300;               // ms late that still gets full timing marks (covers camera + model delay)
    const SYNC_ENERGY_OK = 0.7;            // speed ratio (yours vs dancer's) that still gets full energy marks
    const SYNC_DEPTH_WEIGHT = 0.5;         // depth from one camera is the noisiest axis, so count it less
    const $s = id => document.getElementById(id);
    const syncEl = {
        hud: $s('syncHud'), hudScore: $s('hudScore'), hudLabel: $s('hudLabel'), hudHint: $s('hudHint'),
        hudT: $s('hudTiming'), hudA: $s('hudAlign'), hudE: $s('hudEnergy'),
        ring: $s('syncRing'), score: $s('syncScore'), label: $s('syncLabel'), hint: $s('syncHint'), meta: $s('syncMeta'),
        timing: $s('syncTiming'), align: $s('syncAlign'), energy: $s('syncEnergy'),
        chart: $s('syncChart'), tip: $s('syncTip'), chartEmpty: $s('syncChartEmpty'),
        parts: $s('syncParts'), tips: $s('syncTips'), history: $s('syncHistory'),
        save: $s('syncSaveBtn'), reset: $s('syncResetBtn'), saveNote: $s('syncSaveNote')
    };
    let syncRefs = [];                     // [{t, f}] the dancer's recent poses
    let syncRefSpeed = 0, syncCamSpeed = 0, syncPrevCam = null, syncLastCamT = 0;
    let syncMirror = false, syncMirrorFit = [0, 0];
    let syncShown = null;                  // smoothed live values {overall, align, timing, energy, lag}
    let syncSegFit = SYNC_SEGS.map(() => 1);
    let sess = syncNewSession();

    /* Full-body or half-body video? Each dancer pose counts as full body when the knees and ankles are
       in the picture. Over the last ~150 poses, if most are full body the video is a full-body dance and
       you have to be fully in the camera too before anything is scored. */
    const FRAME_LEGS = [25, 26, 27, 28];   // knees + ankles
    const FRAME_HISTORY = 150, FRAME_MIN = 15;
    let syncRefFrames = [];                // true / false per dancer pose: whole body visible?
    let syncCamFull = 0;                   // smoothed 0..1: is your whole body in the camera?
    let syncCamFullOk = false;
    const syncFullBanner = $s('camFullBody');

    function syncIsFullBody(lm) {
        if (!lm) return false;
        const inPic = p => (p.visibility ?? 1) > 0.5 && p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02;
        return FRAME_LEGS.filter(i => lm[i] && inPic(lm[i])).length >= 3;   // one leg may be hidden behind the other
    }
    function syncRefIsFullBody() {
        if (syncRefFrames.length < FRAME_MIN) return false;   // not sure yet: don't block
        return syncRefFrames.filter(Boolean).length / syncRefFrames.length >= 0.5;
    }
    function syncResetFraming() { syncRefFrames = []; }
    /* full-body video but you are not fully in the camera: no scoring */
    const syncNeedFullBody = () => syncRefIsFullBody() && !syncCamFullOk;


    /* an uploaded recording of yourself can stand in for the camera (see ANALYZE AN UPLOADED RECORDING) */
    let recState = 'idle';                 // 'idle' | 'scanning' | 'playing'
    const recActive = () => recState === 'playing';
    const userLive = () => camRunning() || recActive();

    function syncResetSession() {
        sess = syncNewSession();
        syncShown = null; syncSegFit = SYNC_SEGS.map(() => 1); syncMirrorFit = [0, 0]; syncMirror = false;
        syncPrevCam = null; syncCamSpeed = 0; syncCamFull = 0; syncCamFullOk = false;
    }


    function syncNewSession() {
        return {
            start: performance.now(), samples: [], lastSample: 0, n: 0,
            sum: { overall: 0, align: 0, timing: 0, energy: 0 },
            lagSum: 0, lagN: 0, refSpd: 0, camSpd: 0,
            part: Object.fromEntries(SYNC_PARTS.map(p => [p, { sum: 0, n: 0 }]))
        };
    }

    function syncFeatures(res) {
        const w = res.worldLandmarks?.[0], lm = res.landmarks?.[0];
        if (!w || !lm) return null;
        const mid = (a, b) => ({ x: (w[a].x + w[b].x) / 2, y: (w[a].y + w[b].y) / 2, z: (w[a].z + w[b].z) / 2 });
        const pts = w.slice();
        pts[33] = mid(11, 12); pts[34] = mid(23, 24);
        const seen = i => i >= 33 || (lm[i].visibility ?? 1) > 0.5;
        const f = SYNC_SEGS.map(([, a, b]) => {
            if (!seen(a) || !seen(b)) return null;
            const x = pts[b].x - pts[a].x, y = pts[b].y - pts[a].y, z = (pts[b].z - pts[a].z) * SYNC_DEPTH_WEIGHT;
            const len = Math.hypot(x, y, z);
            return len > 1e-4 ? [x / len, y / len, z / len] : null;
        });
        return f.filter(Boolean).length >= 4 ? f : null;
    }
    const syncAngle = (u, v) => Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) * 180 / Math.PI;

    /* how well your pose matches the dancer's: 1 = within SYNC_ANGLE_OK degrees, 0 = SYNC_ANGLE_ZERO or worse */
    function syncCompare(cam, ref, swap) {
        let sum = 0, n = 0;
        const per = cam.map((u, i) => {
            let v = ref[swap ? SYNC_SWAP[i] : i];
            if (!u || !v) return null;
            if (swap) v = [-v[0], v[1], v[2]];
            const off = syncAngle(u, v) - SYNC_ANGLE_OK;
            const s = Math.max(0, Math.min(1, 1 - off / (SYNC_ANGLE_ZERO - SYNC_ANGLE_OK)));
            sum += s; n++;
            return s;
        });
        return n >= 4 ? { score: sum / n, per } : null;
    }

    /* average segment speed in degrees per second between two poses */
    function syncSpeed(a, b, dt) {
        let sum = 0, n = 0;
        a.forEach((u, i) => { if (u && b[i]) { sum += syncAngle(u, b[i]); n++; } });
        return n && dt > 0 ? sum / n / dt * 1000 : 0;
    }

    function syncAddRef(res) {
        if (res.landmarks?.[0]) {
            syncRefFrames.push(syncIsFullBody(res.landmarks[0]));
            if (syncRefFrames.length > FRAME_HISTORY) syncRefFrames.shift();
        }
        const f = syncFeatures(res);
        if (!f) return;
        const t = performance.now(), last = syncRefs[syncRefs.length - 1];
        if (last) syncRefSpeed += (syncSpeed(f, last.f, t - last.t) - syncRefSpeed) * 0.15;
        syncRefs.push({ t, f });
        while (t - syncRefs[0].t > SYNC_WINDOW + 200) syncRefs.shift();
    }

    function syncAddCam(res) {
        // smoothed, with a gap between on / off so one bad frame does not flip it
        syncCamFull += ((syncIsFullBody(res.landmarks?.[0]) ? 1 : 0) - syncCamFull) * 0.2;
        if (syncCamFullOk ? syncCamFull < 0.3 : syncCamFull > 0.7) syncCamFullOk = !syncCamFullOk;
        const f = syncFeatures(res);
        if (!f) return;
        const now = performance.now();
        if (syncPrevCam) syncCamSpeed += (syncSpeed(f, syncPrevCam, now - syncLastCamT) - syncCamSpeed) * 0.15;
        syncPrevCam = f; syncLastCamT = now;
        if (!vpOn || !syncRefs.length) return;
        if (syncNeedFullBody()) return;    // full-body video: wait until your whole body is in the camera

        // the dancer's poses from the last second (a paused video sends none, so use its last pose)
        let cands = syncRefs.filter(r => now - r.t <= SYNC_WINDOW);
        const paused = !cands.length;
        if (paused) { cands = [syncRefs[syncRefs.length - 1]]; syncRefSpeed = 0; }
        const scored = [false, true].map(swap => cands.map(r => ({ r, c: syncCompare(f, r.f, swap) })).filter(x => x.c));
        const best = scored.map(list => list.reduce((a, x) => (!a || x.c.score > a.c.score ? x : a), null));
        best.forEach((b, i) => { if (b) syncMirrorFit[i] += (b.c.score - syncMirrorFit[i]) * 0.05; });
        // switch between normal / mirror matching only when the other is clearly better
        if (syncMirrorFit[syncMirror ? 0 : 1] > syncMirrorFit[syncMirror ? 1 : 0] + 0.05) syncMirror = !syncMirror;
        const side = syncMirror ? 1 : 0, b = best[side];
        if (!b) return;
        // when several moments fit about equally well, assume the most recent one
        const close = scored[side].filter(x => x.c.score >= b.c.score - 0.02);
        const lag = Math.max(0, now - close[close.length - 1].r.t);

        const moving = syncRefSpeed >= 20;  // dancer standing still: nothing to time
        const align = b.c.score;
        const timing = moving ? Math.max(0, Math.min(1, 1 - (lag - SYNC_LAG_OK) / (SYNC_WINDOW - SYNC_LAG_OK)))   // full marks up to 0.3s late, 0 at 1s
            : (syncShown ? syncShown.timing : 1);
        const hi = Math.max(syncRefSpeed, syncCamSpeed);
        const energy = hi < 15 ? 1 : Math.min(1, Math.min(syncRefSpeed, syncCamSpeed) / hi / SYNC_ENERGY_OK);
        const overall = 0.6 * align + 0.25 * timing + 0.15 * energy;

        const k = 0.08;                    // smoothing so the live numbers do not flicker
        const cur = { overall, align, timing, energy, lag };
        if (!syncShown) syncShown = cur;
        else for (const key in cur) syncShown[key] += (cur[key] - syncShown[key]) * k;
        b.c.per.forEach((s, i) => { if (s != null) syncSegFit[i] += (s - syncSegFit[i]) * k; });

        if (paused) return;                // the session report only counts time the dancer is playing
        sess.n++;
        for (const key in sess.sum) sess.sum[key] += cur[key];
        if (moving) { sess.lagSum += lag; sess.lagN++; }
        sess.refSpd += syncRefSpeed; sess.camSpd += syncCamSpeed;
        b.c.per.forEach((s, i) => { if (s != null) { const p = sess.part[SYNC_SEGS[i][0]]; p.sum += s; p.n++; } });
        if (now - sess.lastSample >= 500) {   // one timeline point every half second
            sess.lastSample = now;
            sess.samples.push({
                s: (now - sess.start) / 1000, v: vpSource === 'file' ? vpVideo.currentTime : null,
                o: syncShown.overall, a: syncShown.align, t: syncShown.timing, e: syncShown.energy
            });
            if (sess.samples.length > 1200) sess.samples.shift();   // keep the last 10 minutes
        }
    }

    const syncPct = v => Math.round(v * 100) + '%';
    const syncLabelFor = o => o >= 0.85 ? 'Excellent sync!' : o >= 0.7 ? 'Good sync' : o >= 0.5 ? 'Getting there' : 'Out of sync';
    const syncClock = sec => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');

    function syncWaitMsg() {
        if (!vpOn) return vpMode === 'file' ? 'Upload a practice video to compare with.' : 'Press Skeleton on the practice video and share this tab to compare.';

        if (!userLive()) return 'Start your camera (or analyze a recording) to compare.';
        if (!syncRefs.length) return 'No dancer found in the practice video yet.';
        const rec = recActive();
        if (rec && recEl.video.paused) return vpVideo.currentTime < recOffset ? 'Waiting for the matched moment...' : 'Paused. Press play on the practice video to continue.';
        if (syncNeedFullBody()) return rec ? 'Full-body video: only moments where your recording shows your whole body are scored.'
            : 'Full-body video: step back so your whole body, feet included, is in the camera.';
        if (performance.now() - syncLastCamT > 600) return rec ? 'You are not fully visible in your recording right now.' : 'Step back until your whole body is in the camera.';

        return null;
    }

    /* ---------- live mini panel on the camera ---------- */
    function syncRenderLive() {

        const live = userLive();
        syncFullBanner.hidden = !(live && vpOn && syncRefs.length && syncNeedFullBody());
        if (!syncFullBanner.hidden) syncFullBanner.textContent = recActive()
            ? 'Full-body dance, but your recording does not show your whole body (feet included). Only moments where you are fully in view are scored.'
            : 'Full-body dance: please step back until your whole body (feet included) is in the camera. Scoring starts once you are fully in view.';
        syncEl.hud.hidden = !live;
        if (!live) return;

        const msg = syncWaitMsg();
        syncEl.hud.classList.toggle('waiting', !!msg || !syncShown);
        if (msg || !syncShown) {
            syncEl.hudScore.textContent = '--';
            syncEl.hudLabel.textContent = 'Sync';
            syncEl.hudHint.textContent = msg || 'Move with the dancer.';
            [syncEl.hudT, syncEl.hudA, syncEl.hudE].forEach(el => el.style.setProperty('--v', 0));
            return;
        }
        const o = syncShown.overall;
        syncEl.hudScore.textContent = syncPct(o);
        syncEl.hudLabel.textContent = syncLabelFor(o);
        syncEl.hudT.style.setProperty('--v', syncShown.timing);
        syncEl.hudA.style.setProperty('--v', syncShown.align);
        syncEl.hudE.style.setProperty('--v', syncShown.energy);
        // point at the body part that matches worst right now
        let worst = null, worstFit = 0.65;
        SYNC_PARTS.forEach(name => {
            const v = SYNC_SEGS.map((s, i) => s[0] === name ? syncSegFit[i] : null).filter(x => x != null);
            const m = v.reduce((a, x) => a + x, 0) / v.length;
            if (m < worstFit) { worstFit = m; worst = name; }
        });
        const lagS = syncShown.lag / 1000;
        syncEl.hudHint.textContent = syncRefSpeed >= 20 && lagS > 0.25 ? lagS.toFixed(1) + 's behind'
            : worst ? 'Check your ' + worst : 'Looking good';
    }
    setInterval(syncRenderLive, 200);

    /* ---------- session report in the Analyzer card ---------- */
    const SYNC_HISTORY_KEY = 'muse.syncHistory';
    function syncHistory() {
        try { return JSON.parse(localStorage.getItem(SYNC_HISTORY_KEY) || '[]'); } catch (e) { return []; }
    }
    function syncAvg() {
        if (!sess.n) return null;
        const a = {};
        for (const key in sess.sum) a[key] = sess.sum[key] / sess.n;
        a.lag = sess.lagN ? sess.lagSum / sess.lagN / 1000 : 0;
        a.secs = (sess.samples.length ? sess.samples[sess.samples.length - 1].s : 0);
        a.parts = SYNC_PARTS.map(name => ({ name, v: sess.part[name].n ? sess.part[name].sum / sess.part[name].n : null }));
        return a;
    }

    function syncRenderReport() {
        const a = syncAvg(), enough = a && sess.n >= 20;
        syncEl.ring.style.setProperty('--p', enough ? Math.round(a.overall * 100) : 0);
        syncEl.score.textContent = enough ? syncPct(a.overall) : '--';
        syncEl.label.textContent = enough ? syncLabelFor(a.overall) + ' (session average)' : 'No session yet';
        syncEl.hint.textContent = enough ? 'The live score is shown on your camera.' : (syncWaitMsg() || 'Dance along for a few seconds...');
        syncEl.meta.textContent = enough
            ? 'Danced ' + syncClock(a.secs) + (sess.lagN ? ' · on average ' + a.lag.toFixed(2) + 's behind' : '') + (syncMirror ? ' · mirror mode' : '')
            : '';
        syncEl.timing.textContent = enough ? syncPct(a.timing) : '--';
        syncEl.align.textContent = enough ? syncPct(a.align) : '--';
        syncEl.energy.textContent = enough ? syncPct(a.energy) : '--';
        syncDrawChart();
        syncRenderParts(enough ? a : null);
        syncRenderTips(enough ? a : null);
        syncRenderHistory(enough ? a : null);
    }

    /* body parts: one bar per part, weakest one marked */
    function syncRenderParts(a) {
        if (!a) { syncEl.parts.innerHTML = '<p class="sync-empty">No data yet.</p>'; return; }
        const valid = a.parts.filter(p => p.v != null);
        const weakest = valid.reduce((w, p) => (!w || p.v < w.v ? p : w), null);
        syncEl.parts.innerHTML = a.parts.map(p => `
            <div class="sync-part${p === weakest && p.v < 0.8 ? ' weak' : ''}" title="${p.name}: ${p.v == null ? 'not visible' : syncPct(p.v)}">
                <span class="sync-part-name">${p.name}</span>
                <span class="sync-part-track"><span class="sync-part-fill" style="width:${p.v == null ? 0 : Math.round(p.v * 100)}%"></span></span>
                <span class="sync-part-val">${p.v == null ? '–' : syncPct(p.v)}</span>
            </div>`).join('');
    }

    /* the hardest stretch of an uploaded video (5 s windows of video time) */
    function syncHardestPart() {
        const buckets = {};
        sess.samples.forEach(p => {
            if (p.v == null) return;
            const k = Math.floor(p.v / 5);
            (buckets[k] ||= []).push(p.o);
        });
        let worst = null;
        for (const [k, v] of Object.entries(buckets)) {
            if (v.length < 4) continue;
            const m = v.reduce((x, y) => x + y, 0) / v.length;
            if (!worst || m < worst.m) worst = { from: k * 5, m };
        }
        return worst;
    }

    function syncRenderTips(a) {
        const tips = [];
        if (!a) {
            tips.push('Upload a practice video (for a link, press Skeleton and share this tab), start your camera and dance along for at least 10 seconds.');
        } else {
            const valid = a.parts.filter(p => p.v != null);
            const weakest = valid.reduce((w, p) => (!w || p.v < w.v ? p : w), null);
            if (weakest && weakest.v < 0.75)
                tips.push(`Your <b>${weakest.name}</b> matches the least (${syncPct(weakest.v)}). Watch only the dancer's ${weakest.name} for a few counts and copy its angle.`);
            if (a.timing < 0.8 && a.lag > 0.25)
                tips.push(`You are about <b>${a.lag.toFixed(1)}s behind</b> on average. Learn the moves at 0.5x in the Speed box, then speed up, and try to start each move a little earlier.`);
            const ref = sess.refSpd / sess.n, cam = sess.camSpd / sess.n;
            if (a.energy < 0.75)
                tips.push(cam < ref
                    ? 'Your moves are <b>smaller or softer</b> than the dancer\'s. Go bigger: stretch your arms fully and hit each move harder.'
                    : 'You are <b>moving more</b> than the dancer. Keep the moves controlled and stop sharply where the dancer stops.');
            const hard = syncHardestPart();
            if (hard && hard.m < 0.75)
                tips.push(`Hardest part: <b>${syncClock(hard.from)}–${syncClock(hard.from + 5)}</b> of the video (${syncPct(hard.m)}). Drag the timeline there and loop it.`);
            if (!tips.length)
                tips.push(a.overall >= 0.85
                    ? 'Great session! For a challenge, try 1.25x in the Speed box or turn off Mirror.'
                    : 'Solid work. Keep practising this section until the score stays above 85%.');
        }
        syncEl.tips.innerHTML = tips.map(t => '<li>' + t + '</li>').join('');
    }

    /* saved sessions: one column per session + change against the last one */
    function syncRenderHistory(a) {
        const hist = syncHistory();
        if (!hist.length) {
            syncEl.history.innerHTML = '<p class="sync-empty">Press “Save session” after practising to track your progress here.</p>';
            return;
        }
        const last = hist[hist.length - 1];
        let delta = '';
        if (a) {
            const d = Math.round((a.overall - last.avg) * 100);
            delta = `<p class="sync-delta">This session ${syncPct(a.overall)} vs last saved ${syncPct(last.avg)}: <b>${d >= 0 ? '+' : ''}${d}</b></p>`;
        }
        syncEl.history.innerHTML = delta + '<div class="sync-cols">' + hist.slice(-8).map(h => {
            const d = new Date(h.date);
            return `<div class="sync-col" title="${d.toLocaleString()}: ${syncPct(h.avg)} (${syncClock(h.secs)} danced)">
                <span class="sync-col-val">${Math.round(h.avg * 100)}</span>
                <span class="sync-col-bar" style="height:${Math.max(4, Math.round(h.avg * 100))}%"></span>
                <span class="sync-col-date">${d.getMonth() + 1}/${d.getDate()}</span>
            </div>`;
        }).join('') + '</div>';
    }

    /* score over time: line chart on a canvas, with a crosshair tooltip */
    let syncHover = null;
    function syncDrawChart() {
        const cv = syncEl.chart, pts = sess.samples;
        syncEl.chartEmpty.hidden = pts.length >= 4;
        const W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
        if (!W || !H) return;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, W, H);
        const L = 34, R = 8, T = 8, B = 20, pw = W - L - R, ph = H - T - B;
        // recessive grid + y labels
        c.font = '11px system-ui, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'right';
        [0, 50, 100].forEach(v => {
            const y = T + ph * (1 - v / 100);
            c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(L, y); c.lineTo(W - R, y); c.stroke();
            c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillText(v + '%', L - 6, y);
        });
        if (pts.length < 4) { syncEl.chart.geom = null; return; }
        const s0 = pts[0].s, s1 = pts[pts.length - 1].s, span = Math.max(1, s1 - s0);
        const X = p => L + (p.s - s0) / span * pw, Y = v => T + ph * (1 - v);
        // x labels: start and end of the timeline
        c.textBaseline = 'top'; c.fillStyle = 'rgba(255,255,255,0.45)';
        c.textAlign = 'left'; c.fillText(syncClock(s0), L, H - B + 5);
        c.textAlign = 'right'; c.fillText(syncClock(s1), W - R, H - B + 5);
        // area + line
        c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(X(p), Y(p.o)) : c.moveTo(X(p), Y(p.o)));
        c.lineTo(X(pts[pts.length - 1]), Y(0)); c.lineTo(X(pts[0]), Y(0)); c.closePath();
        c.fillStyle = 'rgba(196,176,255,0.12)'; c.fill();
        c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(X(p), Y(p.o)) : c.moveTo(X(p), Y(p.o)));
        c.strokeStyle = '#c4b0ff'; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
        // session average as a dashed reference line
        const avg = sess.sum.overall / sess.n;
        c.setLineDash([4, 4]); c.strokeStyle = 'rgba(248,184,216,0.7)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(L, Y(avg)); c.lineTo(W - R, Y(avg)); c.stroke(); c.setLineDash([]);
        c.fillStyle = 'rgba(255,255,255,0.7)'; c.textAlign = 'right'; c.textBaseline = 'bottom';
        c.fillText('avg ' + syncPct(avg), W - R, Y(avg) - 3);
        // hover crosshair
        if (syncHover != null && pts[syncHover]) {
            const p = pts[syncHover], x = X(p), y = Y(p.o);
            c.strokeStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(x, T); c.lineTo(x, T + ph); c.stroke();
            c.fillStyle = '#c4b0ff'; c.strokeStyle = '#120e18'; c.lineWidth = 2;
            c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); c.stroke();
        }
        syncEl.chart.geom = { L, pw, s0, span };
    }
    syncEl.chart.addEventListener('mousemove', e => {
        const g = syncEl.chart.geom, pts = sess.samples;
        if (!g) return;
        const r = syncEl.chart.getBoundingClientRect();
        const s = g.s0 + (e.clientX - r.left - g.L) / g.pw * g.span;
        let best = 0;
        pts.forEach((p, i) => { if (Math.abs(p.s - s) < Math.abs(pts[best].s - s)) best = i; });
        syncHover = best;
        const p = pts[best];
        syncEl.tip.hidden = false;
        syncEl.tip.innerHTML = `<b>${syncPct(p.o)}</b> overall<br>Timing ${syncPct(p.t)} · Align ${syncPct(p.a)} · Energy ${syncPct(p.e)}<br>`
            + (p.v != null ? 'video ' + syncClock(p.v) : 'at ' + syncClock(p.s));
        const x = e.clientX - r.left;
        syncEl.tip.style.left = Math.min(Math.max(0, x - 90), r.width - 190) + 'px';
        syncDrawChart();
    });
    syncEl.chart.addEventListener('mouseleave', () => { syncHover = null; syncEl.tip.hidden = true; syncDrawChart(); });
    setInterval(syncRenderReport, 1000);
    addEventListener('resize', syncDrawChart);

    syncEl.save.addEventListener('click', () => {
        const a = syncAvg();
        if (!a || sess.n < 20) { syncEl.saveNote.textContent = 'Dance a bit longer first.'; return; }
        const hist = syncHistory();
        hist.push({ date: Date.now(), avg: a.overall, align: a.align, timing: a.timing, energy: a.energy, secs: a.secs });
        try { localStorage.setItem(SYNC_HISTORY_KEY, JSON.stringify(hist.slice(-20))); } catch (e) { }
        syncEl.saveNote.textContent = 'Saved ' + syncPct(a.overall) + '. New session started.';
        sess = syncNewSession();
        syncRenderReport();
    });
    syncEl.reset.addEventListener('click', () => {
        syncResetSession();
        syncEl.saveNote.textContent = '';
        syncRenderReport();
    });

    /* =========================================================
       ANALYZE AN UPLOADED RECORDING OF YOURSELF
       1. Both videos are scanned (one pose every few tenths of a second).
       2. The recording is slid along the practice video to find where the moves
          match best: that is the moment the two line up (mirror-style is tried too).
       3. Both videos jump to that moment and play together; every frame of the
          recording goes into the analyzer exactly like a camera frame.
       4. It stops when either video ends. Pausing the practice video pauses both.
       ========================================================= */
    const recEl = {
        stage: $s('recStage'), video: $s('recVideo'), canvas: $s('recCanvas'),
        upload: $s('recUpload'), btn: $s('recAnalyzeBtn'), status: $s('recStatus'), badge: $s('camBadge')
    };
    const recCtx = recEl.canvas.getContext('2d');
    const REC_MAX_SAMPLES = 600;           // poses scanned per video at most (longer videos use a bigger step)
    const REC_MIN_STEP = 0.25;             // seconds between scanned poses
    const REC_MIN_MATCH = 0.45;            // below this the videos are probably not the same dance
    let recURL = null, recLandmarker = null, recLoadingLm = null, recLastTs = 0;
    let recRun = 0;                        // bumps on every start / stop so older async work gives up
    let recOffset = 0, recDur = 0;         // recOffset = practice-video time minus recording time
    let recTimer = null;
    const recScanCache = new Map();        // url|step -> scanned poses

    function recSay(msg, isError) {
        recEl.status.textContent = msg;
        recEl.status.classList.toggle('error', !!isError);
    }
    function recUpdateBtn() {
        recEl.btn.disabled = !recURL;
        recEl.btn.textContent = recState === 'idle' ? 'Analyze recording' : 'Stop analysis';
        recEl.btn.classList.toggle('active-btn', recState !== 'idle');
    }
    function recShow(on) {
        recEl.stage.hidden = !on;
        if (!camRunning()) recEl.badge.textContent = on ? 'MY VIDEO' : 'OFF';
    }

    /* its own pose model on the page, so it never fights with the practice-video worker */
    function recNextTs() { recLastTs = Math.max(performance.now(), recLastTs + 1); return recLastTs; }
    async function recLoadModel() {
        if (recLandmarker) return;
        if (!recLoadingLm) {
            recLoadingLm = (async () => {
                const fileset = await FilesetResolver.forVisionTasks(VP_MP + '/wasm');
                const make = delegate => PoseLandmarker.createFromOptions(fileset, {
                    baseOptions: { modelAssetPath: VP_MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1
                });
                try { recLandmarker = await make('GPU'); }
                catch (e) { console.warn('GPU delegate failed, using CPU instead', e); recLandmarker = await make('CPU'); }
            })().catch(err => { recLoadingLm = null; throw err; });
        }
        return recLoadingLm;
    }
    const recDetect = v => recLandmarker.detectForVideo(vpShrink(v, v.videoWidth, v.videoHeight), recNextTs());

    function recWait(el, ev, ms) {
        return new Promise(resolve => {
            const done = () => { clearTimeout(timer); el.removeEventListener(ev, done); resolve(); };
            const timer = setTimeout(done, ms);
            el.addEventListener(ev, done);
        });
    }
    async function recSeek(v, t) {
        if (Math.abs(v.currentTime - t) < 0.001 && v.readyState >= 2) return;
        const p = recWait(v, 'seeked', 4000);
        v.currentTime = t;
        await p;
    }
    /* videos recorded in the browser (WebM) often report their length as Infinity until you seek to the end */
    async function recDuration(v) {
        if (v.readyState < 1) await recWait(v, 'loadedmetadata', 10000);
        if (!isFinite(v.duration)) { await recSeek(v, 1e9); await recSeek(v, 0); }
        return isFinite(v.duration) ? v.duration : 0;
    }

    /* the pose every `step` seconds through a video, on a hidden copy so the players are not disturbed */
    async function recScan(url, step, run, onProgress) {
        const key = url + '|' + step;
        if (recScanCache.has(key)) { onProgress(1); return recScanCache.get(key); }
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
        try {
            const dur = await recDuration(v);
            if (v.readyState < 2) await recWait(v, 'loadeddata', 10000);
            if (!dur || !v.videoWidth) throw new Error('Could not read one of the videos.');
            const n = Math.floor(dur / step) + 1, out = [];
            for (let i = 0; i < n; i++) {
                if (run !== recRun) return null;           // stopped meanwhile
                await recSeek(v, Math.min(i * step, dur - 0.05));
                let f = null;
                try { f = syncFeatures(recDetect(v)); } catch (e) { console.warn(e); }
                out.push(f);
                onProgress((i + 1) / n);
            }
            recScanCache.set(key, out);
            return out;
        } finally {
            v.removeAttribute('src'); v.load();
        }
    }

    /* slide the recording along the practice video; the offset whose poses agree best is the match */
    function recAlign(ref, rec, step) {
        const valid = a => a.filter(Boolean).length;
        const minPairs = Math.max(8, Math.floor(0.5 * Math.min(valid(ref), valid(rec))));   // a tiny overlap proves nothing
        let best = null;
        [false, true].forEach(swap => {
            const S = rec.map(a => a ? ref.map(b => { const c = b && syncCompare(a, b, swap); return c ? c.score : null; }) : null);
            for (let k = 1 - rec.length; k < ref.length; k++) {
                let sum = 0, n = 0;
                for (let j = Math.max(0, -k); j < rec.length && j + k < ref.length; j++) {
                    const s = S[j] ? S[j][j + k] : null;
                    if (s != null) { sum += s; n++; }
                }
                if (n >= minPairs && (!best || sum / n > best.score)) best = { score: sum / n, offset: k * step, mirror: swap };
            }
        });
        return best;
    }

    async function recStart() {
        if (recState !== 'idle') return;
        if (!recURL) { recSay('Upload a video of yourself dancing first.', true); return; }
        if (vpMode !== 'file' || !vpVideo.currentSrc || !vpVideo.videoWidth) {
            recSay('Upload the practice video as a file first (YouTube / TikTok / Instagram links cannot be scanned).', true);
            return;
        }
        if (!vpOn) { recSay('The practice video is not tracked yet. Wait for the pose model to load, then try again.', true); return; }
        const run = ++recRun;
        recState = 'scanning';
        recUpdateBtn();
        window.MUSE?.camera?.stop?.();                   // the recording takes the camera's place
        vpVideo.pause(); recEl.video.pause();
        recShow(true);
        try {
            recSay('Loading pose model...');
            await recLoadModel();
            const dRef = isFinite(vpVideo.duration) ? vpVideo.duration : await recDuration(vpVideo);
            const dRec = await recDuration(recEl.video);
            if (!dRef || !dRec) throw new Error('Could not read the length of the videos.');
            const step = Math.max(REC_MIN_STEP, Math.ceil(Math.max(dRef, dRec) / REC_MAX_SAMPLES * 20) / 20);
            const say = (half, p) => recSay('Finding where your recording matches the practice video... ' + Math.round((half + p) * 50) + '%');
            const ref = await recScan(vpVideo.currentSrc, step, run, p => say(0, p));
            if (!ref) return;
            const rec = await recScan(recURL, step, run, p => say(1, p));
            if (!rec) return;
            if (ref.filter(Boolean).length < 8) throw new Error('No dancer was found in the practice video.');
            if (rec.filter(Boolean).length < 8) throw new Error('No dancer was found in your recording. Make sure your body is in the picture.');
            const m = recAlign(ref, rec, step);
            if (!m || m.score < REC_MIN_MATCH) throw new Error('Could not find where your recording matches the practice video. Is it the same dance?');

            recOffset = m.offset; recDur = dRec;
            const refStart = Math.max(0, m.offset), recStart = refStart - m.offset;
            await Promise.all([recSeek(vpVideo, refStart), recSeek(recEl.video, recStart)]);
            if (run !== recRun) return;
            syncResetSession();                          // a fresh report for this recording
            syncMirror = m.mirror;
            syncMirrorFit = m.mirror ? [0, m.score] : [m.score, 0];
            recEl.video.playbackRate = vpVideo.playbackRate;
            recState = 'playing';
            recUpdateBtn();
            recSay('Matched: your recording at ' + syncClock(recStart) + ' = practice video at ' + syncClock(refStart)
                + ' (' + syncPct(m.score) + ' match' + (m.mirror ? ', mirrored' : '') + '). Analyzing until the video ends...');
            recTimer = setInterval(() => recFollow(!vpVideo.paused), 250);
            recLoop(run);
            // its 'play' event starts the recording too
            vpVideo.play().catch(() => recSay('Matched! Press play on the practice video to start the analysis.'));
        } catch (err) {
            if (run !== recRun) return;
            console.error(err);
            recState = 'idle';
            recUpdateBtn();
            recSay(err.message || String(err), true);
        }
    }

    /* keep the recording on the same moment as the practice video (the practice video is the clock) */
    function recFollow(playing) {
        if (!recActive()) return;
        const v = recEl.video, want = vpVideo.currentTime - recOffset;
        if (want >= recDur - 0.1) { recFinish(); return; }
        if (want < 0) {                                  // before the matched moment: hold the first frame
            if (!v.paused) v.pause();
            if (v.currentTime > 0.05) v.currentTime = 0;
            return;
        }
        if (Math.abs(v.currentTime - want) > 0.25) v.currentTime = want;   // drifted, or the practice video was seeked
        if (playing && v.paused) v.play().catch(() => { });
        if (!playing && !v.paused) v.pause();
    }

    function recLoop(run) {
        if (run !== recRun || !recActive()) return;
        const v = recEl.video, cb = () => { recFrame(); recLoop(run); };
        if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(cb);
        else requestAnimationFrame(cb);
    }
    function recFrame() {
        const v = recEl.video;
        if (!recActive() || v.paused || v.readyState < 2) return;
        let res;
        try { res = recDetect(v); } catch (e) { console.warn(e); return; }
        const c = recEl.canvas;
        if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight; }
        recCtx.clearRect(0, 0, c.width, c.height);
        if (res.landmarks?.[0]) vpDrawPoses(recCtx, c.width, [res.landmarks[0]]);
        syncAddCam(res);
    }

    function recStop(msg) {
        recRun++;
        clearInterval(recTimer);
        recState = 'idle';
        recEl.video.pause();
        recUpdateBtn();
        if (msg) recSay(msg);
    }
    function recFinish() {
        recStop();
        vpVideo.pause();
        const a = syncAvg();
        recSay(a && sess.n >= 20
            ? 'Done! Your recording scored ' + syncPct(a.overall) + '. The full report is in the Analyzer card.'
            : 'Done, but there was not enough to score (was your whole body in the recording?).');
        syncRenderReport();
    }

    function recLoad(file) {
        if (!file || !file.type.startsWith('video/')) { recSay('Please choose a video file.', true); return; }
        if (recState !== 'idle') recStop();
        if (recURL) {
            recScanCache.forEach((_, k) => { if (k.startsWith(recURL + '|')) recScanCache.delete(k); });
            URL.revokeObjectURL(recURL);
        }
        recURL = URL.createObjectURL(file);
        recEl.video.src = recURL;
        recEl.video.load();
        recCtx.clearRect(0, 0, recEl.canvas.width, recEl.canvas.height);
        if (!camRunning()) recShow(true);
        recUpdateBtn();
        recSay('Loaded “' + file.name + '”. Press Analyze recording: it finds where your moves match the practice video, then plays both together.');
    }

    recEl.upload.addEventListener('change', e => { recLoad(e.target.files[0]); e.target.value = ''; });
    recEl.btn.addEventListener('click', () => {
        if (recState === 'idle') recStart();
        else { recStop('Analysis stopped.'); vpVideo.pause(); }
    });
    vpVideo.addEventListener('play', () => recFollow(true));
    vpVideo.addEventListener('pause', () => recFollow(false));
    vpVideo.addEventListener('ended', () => { if (recActive()) recFinish(); });
    vpVideo.addEventListener('ratechange', () => { recEl.video.playbackRate = vpVideo.playbackRate; });
    vpVideo.addEventListener('loadstart', () => { if (recState !== 'idle') recStop('The practice video changed, so the analysis stopped.'); });
    recEl.video.addEventListener('ended', () => { if (recActive()) recFinish(); });
    document.addEventListener('muse:camerastart', () => {
        if (recState !== 'idle') recStop('The camera was started, so the recording analysis stopped.');
        recShow(false);
    });
    document.addEventListener('muse:leave', () => { if (recState !== 'idle') recStop(); });
    recUpdateBtn();

    syncRenderReport();

    /* A paused video produces no frame callbacks, so redraw after seeking / loading */
    vpVideo.addEventListener('seeked', () => { vpTrack = []; vpDetect(true); });
    vpVideo.addEventListener('loadeddata', () => {
        vpLastT = -1; syncResetFraming(); vpLayout(); vpDetect(true);
        vpStartFile();                                   // a video is here: start tracking in the background
    });
    vpVideo.addEventListener('loadedmetadata', vpLayout);
    new ResizeObserver(() => { if (vpOn && vpSource === 'file') vpLayout(); }).observe(vpVideo);
    window.addEventListener('resize', () => { if (vpOn && vpSource === 'file') vpLayout(); });

    /* script.js tells us when the player switches between file / YouTube / TikTok / Instagram */
    document.addEventListener('muse:videomode', e => {
        vpMode = e.detail.mode;
        vpTrack = [];
        vpSyncSlider();
        // a skeleton started for the other kind of source no longer makes sense
        if (vpOn && ((vpSource === 'file' && vpMode !== 'file') || (vpSource === 'capture' && vpMode === 'file'))) {
            vpTurnOff();
        }
        if (!vpOn) {
            vpSetStatus(vpIdleHint());
            vpStartFile();                               // back on a loaded file: track it again (no-op otherwise)
        }
    });

    /* Leaving the Dance page stops the analysis (and the screen capture) */
    document.addEventListener('muse:leave', () => { if (vpOn) vpTurnOff(); });

    /* camera.js calls this with every new camera pose */
    window.MUSE = window.MUSE || {};

    window.MUSE.sync = { addCam: res => { if (recState === 'idle') syncAddCam(res); } };   // a recording being analyzed has priority


    /* this script loads after the page, so a video may already be waiting */
    vpUpdateBtn();
    vpStartFile();
})();
