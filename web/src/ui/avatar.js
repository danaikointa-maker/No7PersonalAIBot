// Cozmo-style expressive eyes on <canvas> — 14 emotions, driven by derived state.
// Re-implementation of the ESP32 display eye renderer (works in any browser).

export const EMOTIONS = [
  'neutral', 'happy', 'listening', 'thinking', 'speaking',
  'surprised', 'sad', 'angry', 'sleepy', 'love',
  'confused', 'wink', 'error', 'excited',
];

export class EyeAvatar {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.emotion = 'neutral';
    this.blink = 0;          // 0..1 how closed
    this.blinkTimer = 0;
    this.t = 0;
    this.running = false;
    this._raf = null;
  }

  setEmotion(e) {
    if (EMOTIONS.includes(e)) this.emotion = e;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      this.t += 0.016;
      this.blinkTimer += 0.016;
      if (this.blinkTimer > 3 + Math.random() * 3) { this.blink = 0.001; this.blinkTimer = 0; }
      if (this.blink > 0) {
        this.blink += 0.12;
        if (this.blink >= 1) this.blink = 0;
      }
      this.draw();
      this._raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  draw() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // background glow
    const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(34,211,238,0.18)');
    g.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const ex = W * 0.28, ey = H * 0.52;
    const baseW = W * 0.17, baseH = H * 0.42;
    const bob = Math.sin(this.t * 1.6) * 2;

    const spec = eyeSpec(this.emotion, this.t);
    const leftW = baseW * spec.w, leftH = baseH * spec.h * (1 - this.blink);
    const rightW = leftW * (spec.rightScale || 1), rightH = leftH * (spec.rightScale ? spec.hScale || 1 : 1);

    this._eye(W / 2 - ex, ey + bob + spec.dy, leftW, leftH, spec.pupilX, spec.pupilY, spec);
    this._eye(W / 2 + ex, ey + bob + spec.dy, rightW, rightH, spec.pupilX, spec.pupilY, spec);

    // mouth (optional, small)
    if (spec.mouth) {
      ctx.strokeStyle = 'rgba(34,211,238,0.9)';
      ctx.lineWidth = Math.max(2, H * 0.025);
      ctx.lineCap = 'round';
      ctx.beginPath();
      const my = H * 0.9, mw = W * 0.09;
      if (spec.mouth === 'smile') ctx.arc(W / 2, my - mw * 0.6, mw, 0.15 * Math.PI, 0.85 * Math.PI);
      else if (spec.mouth === 'frown') ctx.arc(W / 2, my + mw * 0.9, mw, 1.15 * Math.PI, 1.85 * Math.PI);
      else { ctx.moveTo(W / 2 - mw, my); ctx.lineTo(W / 2 + mw, my); }
      ctx.stroke();
    }
  }

  _eye(cx, cy, w, h, px, py, spec) {
    const { ctx } = this;
    if (h < 1) h = 1;
    ctx.save();
    ctx.translate(cx, cy);

    // glow
    ctx.shadowColor = spec.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = spec.color;
    ctx.beginPath();
    roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.45);
    ctx.fill();
    ctx.shadowBlur = 0;

    // pupil / highlight
    if (spec.pupil !== false && h > h * 0.2) {
      ctx.fillStyle = 'rgba(6,20,32,0.85)';
      const pw = w * 0.46, ph = h * 0.46;
      const cx2 = px * (w - pw) / 2, cy2 = py * (h - ph) / 2;
      ctx.beginPath();
      roundRect(ctx, cx2 - pw / 2, cy2 - ph / 2, pw, ph, pw * 0.4);
      ctx.fill();
    }
    if (spec.sparkle) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(-w * 0.18, -h * 0.2, Math.max(1.5, w * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function eyeSpec(emotion, t) {
  const base = { w: 1, h: 1, pupilX: 0, pupilY: 0, dy: 0, color: '#22d3ee', sparkle: true, mouth: null };
  switch (emotion) {
    case 'happy': return { ...base, h: 0.82, mouth: 'smile', sparkle: true };
    case 'excited': return { ...base, h: 0.9, dy: Math.sin(t * 10) * 3, mouth: 'smile', sparkle: true };
    case 'listening': return { ...base, h: 1.05, color: '#34d399', pupilX: Math.sin(t * 2) * 0.4 };
    case 'thinking': return { ...base, h: 0.75, color: '#a78bfa', pupilY: -0.5, pupilX: Math.cos(t * 1.2) * 0.5 };
    case 'speaking': return { ...base, h: 0.85 + Math.sin(t * 14) * 0.12, color: '#22d3ee' };
    case 'surprised': return { ...base, w: 1.15, h: 1.25, sparkle: true, mouth: 'oh' };
    case 'sad': return { ...base, h: 0.8, dy: 2, mouth: 'frown', sparkle: false };
    case 'angry': return { ...base, h: 0.6, w: 1.1, color: '#f87171', pupil: false, mouth: 'frown' };
    case 'sleepy': return { ...base, h: 0.45, color: '#93a1bd', sparkle: false, mouth: '-' };
    case 'love': return { ...base, color: '#fb7185', h: 0.95, mouth: 'smile' };
    case 'confused': return { ...base, rightScale: 0.75, rightScale2: 0.75, h: 0.9, color: '#fbbf24', mouth: '-' };
    case 'wink': return { ...base, rightScale: 0.25, hScale: 0.25, mouth: 'smile' };
    case 'error': return { ...base, color: '#f87171', h: 0.7, pupil: true, mouth: 'frown' };
    default: return { ...base, mouth: 'smile' };
  }
}
