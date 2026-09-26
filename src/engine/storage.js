// Local save. Wrapped so an iOS shell (e.g. Capacitor Preferences) can swap
// the backend without touching game code. Writes are debounced unless asked
// to be immediate; every write reports whether it actually happened, and a
// failure is announced (once) through onError rather than ignored.
//
// Keys:
//   postcard-perfect/save             the save
//   postcard-perfect/save/backup      the last good save before a migration or a fresh start
//   postcard-perfect/save/unreadable  a save that couldn't be read, kept aside, never deleted by the game

const KEY = 'postcard-perfect/save';
const BACKUP = `${KEY}/backup`;
const UNREADABLE = `${KEY}/unreadable`;

export const storage = {
  backend: {
    get(k) { return localStorage.getItem(k); },
    set(k, v) { localStorage.setItem(k, v); },
    remove(k) { localStorage.removeItem(k); },
  },
  onError: null,
  _timer: null,
  _warned: false,

  /** Can this device keep a save at all? (Private browsing or a blocked site can say no.) */
  available() {
    try { this.backend.set(`${KEY}/probe`, '1'); this.backend.remove(`${KEY}/probe`); return true; } catch { return false; }
  },

  /** {status: 'empty' | 'ok' | 'corrupt' | 'unavailable', data?, raw?} */
  read(key = KEY) {
    let raw;
    try { raw = this.backend.get(key); } catch { return { status: 'unavailable' }; }
    if (raw == null) return { status: this.available() ? 'empty' : 'unavailable' };
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return { status: 'corrupt', raw };
      return { status: 'ok', data, raw };
    } catch { return { status: 'corrupt', raw }; }
  },
  readBackup() { return this.read(BACKUP); },

  /** Keep a copy of a good save before changing it for good. */
  backup(raw) { return this._write(BACKUP, raw); },
  /** Put an unreadable save aside (it is never deleted). */
  setAside(raw) { return this._write(UNREADABLE, raw); },

  load() { const r = this.read(); return r.status === 'ok' ? r.data : null; },

  /** Returns true if the save was written (always true for a debounced write that is still pending). */
  save(data, immediate = false) {
    clearTimeout(this._timer);
    const write = () => this._write(KEY, JSON.stringify(data));
    if (immediate) return write();
    this._timer = setTimeout(write, 250);
    return true;
  },

  _write(key, value) {
    try {
      this.backend.set(key, value);
      this._warned = false;
      return true;
    } catch (err) {
      if (!this._warned) { this._warned = true; this.onError?.(err); }
      return false;
    }
  },

  /** Start again: the current save becomes the backup first, so it can be recovered. */
  clear() {
    const r = this.read();
    if (r.raw) this.backup(r.raw);
    try { this.backend.remove(KEY); } catch { /* nothing to remove */ }
  },
};
