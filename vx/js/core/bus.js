/* A tiny typed event bus shared by every vx module.
   bus.on(type, fn) returns an unsubscribe function; bus.emit(type, detail) is synchronous.
   bus.state holds the last emitted detail per type so late subscribers can read it. */
const listeners = new Map();
const state = Object.create(null);
export const bus = {
  state,
  on(type, fn, { replay = false } = {}) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    if (replay && type in state) fn(state[type]);
    return () => bus.off(type, fn);
  },
  once(type, fn) { const off = bus.on(type, (d) => { off(); fn(d); }); return off; },
  off(type, fn) { listeners.get(type)?.delete(fn); },
  emit(type, detail) {
    state[type] = detail;
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) { try { fn(detail); } catch (err) { console.error(`[bus] listener for "${type}" threw`, err); } }
  },
  clear() { listeners.clear(); for (const k of Object.keys(state)) delete state[k]; },
};
export default bus;
