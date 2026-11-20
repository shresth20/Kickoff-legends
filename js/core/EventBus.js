/* Typed-by-convention pub/sub. One bus per match; systems publish, HUD/audio/FX subscribe.
 * Events: KICK, BUMP, GOAL, WHISTLE, CLOCK, SUPER_METER, SUPER_READY, SUPER_FIRED, HURT, LAND, PAUSE, MATCH_END */
window.KL = window.KL || {};

KL.EventBus = class EventBus {
  constructor() {
    this.handlers = new Map();
  }
  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }
  once(event, handler) {
    const off = this.on(event, (p) => {
      off();
      handler(p);
    });
    return off;
  }
  off(event, handler) {
    this.handlers.get(event)?.delete(handler);
  }
  emit(event, payload) {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of [...set]) h(payload);
  }
  clear() {
    this.handlers.clear();
  }
};
