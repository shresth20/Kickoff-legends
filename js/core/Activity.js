/* KL.Activity: is the player here? The game rests whenever they aren't:
 *  - hidden: its tab is in the background (another tab, the app switched away, the screen locked);
 *  - blur:   its window isn't in front (another app or window has focus, alt-tab);
 *  - idle:   nobody has touched a key, the mouse or the screen for KL.ACTIVITY.idleSec.
 * Resting means the game loop stops updating and drawing (tweens, timers, the sky and the crowd all
 * hold), every sound is suspended (music, crowd, ambience; the announcer stops: KL.Audio listens
 * here), a live match pauses itself (every running scene with an autoPause() method is asked to) and
 * a "Paused" card covers the frozen picture. Any key, click or tap, or the window coming back to the
 * front, wakes it all up; a match then waits on its pause menu until the player resumes.
 * Only a change counts: a page that opens without focus (an embed nobody has clicked yet) keeps
 * running until it actually loses focus. ?autopause=0 keeps only the hidden-tab pause (handy with
 * the dev tools open, which take the focus). */
window.KL = window.KL || {};

KL.ACTIVITY = { idleSec: 120 };

KL.Activity = {
  active: true,
  reason: null, // why not, while inactive: 'hidden' | 'blur' | 'idle'
  listeners: new Set(),
  watch: { blur: true, idle: true },

  /** Why the player counts as away (pure): the first reason that applies, or null when they're here. */
  reasonFor({ hidden, focused, idleMs, idleLimitMs, watch = { blur: true, idle: true } }) {
    if (hidden) return 'hidden';
    if (watch.blur && !focused) return 'blur';
    if (watch.idle && idleMs >= idleLimitMs) return 'idle';
    return null;
  },

  /** fn(active, reason) on every change. Returns the unsubscribe function. */
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  attach(game) {
    this.game = game;
    if (new URLSearchParams(location.search).get('autopause') === '0') this.watch = { blur: false, idle: false };
    const st = (this.state = { hidden: document.hidden, focused: true, last: performance.now() });
    const check = () => this.update();
    const seen = () => (st.last = performance.now());
    document.addEventListener('visibilitychange', () => {
      st.hidden = document.hidden;
      if (!st.hidden) seen();
      check();
    });
    window.addEventListener('pagehide', () => ((st.hidden = true), check()));
    window.addEventListener('pageshow', () => ((st.hidden = document.hidden), seen(), check()));
    window.addEventListener('blur', () => ((st.focused = false), check()));
    window.addEventListener('focus', () => ((st.focused = true), seen(), check()));
    // A key, click or tap: they're here, and it's in front. Captured on the window, so the game wakes
    // before it sees the event (that same click still presses its button).
    const touched = () => {
      st.focused = !document.hidden;
      seen();
      if (!this.active) check();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, touched, { capture: true, passive: true });
    // The mouse moving or a wheel over the page only says they're watching: it ends an idle rest,
    // not an unfocused one (keys would still go to the other window).
    const moved = () => {
      seen();
      if (this.reason === 'idle') check();
    };
    for (const ev of ['pointermove', 'wheel']) window.addEventListener(ev, moved, { capture: true, passive: true });
    setInterval(check, 1000); // the idle clock
    this.card = document.getElementById('idle');
  },

  update() {
    const st = this.state;
    if (!st || !this.game) return;
    const reason = this.reasonFor({ hidden: st.hidden, focused: st.focused, idleMs: performance.now() - st.last, idleLimitMs: KL.ACTIVITY.idleSec * 1000, watch: this.watch });
    const active = !reason;
    this.reason = reason;
    this.showCard(!active && reason !== 'hidden');
    if (active === this.active) return;
    this.active = active;
    const game = this.game;
    if (!active) {
      // a live match waits on its pause menu (it opens once the game wakes)
      for (const scene of game.scene.getScenes(true)) scene.autoPause?.();
      game.pause();
    } else game.resume();
    for (const fn of this.listeners) fn(active, reason);
  },

  /** The "Paused — press any key" card over the frozen game (not needed for a hidden tab). */
  showCard(on) {
    const el = this.card;
    if (!el || el.hidden === !on) return;
    if (on) {
      el.querySelector('.idle__title').textContent = KL.t('pause_title');
      el.querySelector('.idle__hint').textContent = KL.t(KL.View?.touch ? 'idle_hint_touch' : 'idle_hint');
    }
    el.hidden = !on;
  },
};
