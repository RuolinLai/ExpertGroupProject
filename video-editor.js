// video-editor.js - Complete Video Editor Controls

// 1. Get references to the video and all control buttons
const video = document.getElementById('danceVideo');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const slowBtn = document.getElementById('slowBtn');
const normalBtn = document.getElementById('normalBtn');
const fastBtn = document.getElementById('fastBtn');
const mirrorBtn = document.getElementById('mirrorBtn');

// 2. Play & Pause Controls
playBtn.addEventListener('click', () => {
    video.play();
});

pauseBtn.addEventListener('click', () => {
    video.pause();
});

// 3. Speed Control (Playback Rate)
slowBtn.addEventListener('click', () => {
    video.playbackRate = 0.5; // 0.5x Slow motion
});

normalBtn.addEventListener('click', () => {
    video.playbackRate = 1.0; // Normal speed
});

fastBtn.addEventListener('click', () => {
    video.playbackRate = 1.5; // 1.5x Speed up
});

// 4. Mirror Effect (Flip horizontally for choreography practice)
let isMirrored = false;
mirrorBtn.addEventListener('click', () => {
    isMirrored = !isMirrored;
    if (isMirrored) {
        video.style.transform = 'scaleX(-1)';
    } else {
        video.style.transform = 'scaleX(1)';
    }
});