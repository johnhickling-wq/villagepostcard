// Haptic hooks. On the web we use navigator.vibrate where available; an iOS
// wrapper can replace `haptics.impl` with native Taptic Engine calls.

const PATTERNS = { light: 8, medium: 16, heavy: 30, success: [12, 40, 18], warning: [30, 50, 30], select: 5 };

export const haptics = {
  enabled: true,
  impl(pattern) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
  },
  play(kind = 'light') {
    if (!this.enabled) return;
    try { this.impl(PATTERNS[kind] ?? PATTERNS.light, kind); } catch { /* ignore */ }
  },
};
