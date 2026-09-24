// Local save. Wrapped so an iOS shell (e.g. Capacitor Preferences) can swap
// the backend without touching game code. Writes are debounced.

const KEY = 'postcard-perfect/save';

export const storage = {
  backend: {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  },
  load() {
    const raw = this.backend.get(KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  _timer: null,
  save(data, immediate = false) {
    clearTimeout(this._timer);
    const write = () => this.backend.set(KEY, JSON.stringify(data));
    if (immediate) write(); else this._timer = setTimeout(write, 250);
  },
  clear() { this.backend.remove(KEY); },
};
