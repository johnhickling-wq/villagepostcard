// Touch gestures for the scene canvas: tap, one-finger pan, two-finger pinch.
// Mouse and wheel work too, for desktop testing.

export class Gestures {
  constructor(el, handlers) {
    this.el = el;
    this.h = handlers;
    this.pointers = new Map();
    this.tapCandidate = null;
    this.pinch = null;
    this.moved = false;
    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this._wheel = this._wheel.bind(this);
    el.addEventListener('pointerdown', this._down);
    el.addEventListener('pointermove', this._move);
    el.addEventListener('pointerup', this._up);
    el.addEventListener('pointercancel', this._up);
    el.addEventListener('wheel', this._wheel, { passive: false });
    el.style.touchAction = 'none';
  }

  destroy() {
    const el = this.el;
    el.removeEventListener('pointerdown', this._down);
    el.removeEventListener('pointermove', this._move);
    el.removeEventListener('pointerup', this._up);
    el.removeEventListener('pointercancel', this._up);
    el.removeEventListener('wheel', this._wheel);
  }

  _pos(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _down(e) {
    this.el.setPointerCapture?.(e.pointerId);
    const p = this._pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.tapCandidate = { ...p, t: performance.now(), id: e.pointerId };
      this.moved = false;
      this.last = p;
      this.h.onDown?.(p.x, p.y);
    } else if (this.pointers.size === 2) {
      this.tapCandidate = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this._pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      this.h.onPinch?.(d / this.pinch.d, cx, cy, cx - this.pinch.cx, cy - this.pinch.cy);
      this.pinch = { d, cx, cy };
      return;
    }
    if (this.tapCandidate && Math.hypot(p.x - this.tapCandidate.x, p.y - this.tapCandidate.y) > 10) {
      this.moved = true;
      this.tapCandidate = null;
    }
    if (this.moved && this.last) this.h.onPan?.(p.x - this.last.x, p.y - this.last.y);
    this.last = p;
  }

  _up(e) {
    const had = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!had) return;
    const tc = this.tapCandidate;
    if (tc && tc.id === e.pointerId && e.type === 'pointerup' && performance.now() - tc.t < 500) {
      this.h.onTap?.(tc.x, tc.y);
    }
    if (this.pointers.size === 0) {
      this.tapCandidate = null;
      if (this.moved) this.h.onPanEnd?.();
    }
  }

  _wheel(e) {
    e.preventDefault();
    const p = this._pos(e);
    this.h.onPinch?.(Math.exp(-e.deltaY * 0.0015), p.x, p.y, 0, 0);
  }
}
