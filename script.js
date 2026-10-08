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
