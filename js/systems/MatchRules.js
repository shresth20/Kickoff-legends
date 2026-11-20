/* Pure match-state machine (no Phaser): feed elapsed ms + goals, read back events.
 * Phases: countdown → play → (goal → countdown)* → [suddendeath_countdown → suddendeath] → over */
window.KL = window.KL || {};

KL.MatchRules = class MatchRules {
  constructor(opts = {}) {
    const M = (typeof KL !== 'undefined' && KL.TUNING?.match) || {};
    this.durationSec = opts.durationSec ?? M.durationSec ?? 90;
    this.suddenDeathSec = opts.suddenDeathSec ?? M.suddenDeathSec ?? 30;
    this.countdownMs = opts.countdownMs ?? M.kickoffCountdownMs ?? 1000;
    this.goalFreezeMs = opts.goalFreezeMs ?? M.goalFreezeMs ?? 1500;
    this.state = {
      phase: 'countdown',
      score: [0, 0],
      clockMs: this.durationSec * 1000,
      suddenDeath: false,
      phaseTimerMs: this.countdownMs,
      winner: null,
    };
    this.lastWholeSecond = -1;
  }

  get isPlaying() {
    return this.state.phase === 'play' || this.state.phase === 'suddendeath';
  }
  get secondsLeft() {
    return Math.ceil(this.state.clockMs / 1000);
  }

  /** Advance time; returns events: {type:'kickoff'|'goal'|'suddendeath'|'fulltime'|'clock', ...} */
  tick(dtMs) {
    const s = this.state;
    const out = [];
    switch (s.phase) {
      case 'countdown':
      case 'suddendeath_countdown':
      case 'goal':
        s.phaseTimerMs -= dtMs;
        if (s.phaseTimerMs <= 0) {
          if (s.phase === 'goal') {
            if (s.suddenDeath) {
              s.phase = 'over';
              out.push({ type: 'fulltime' });
            } else {
              s.phase = 'countdown';
              s.phaseTimerMs = this.countdownMs;
              out.push({ type: 'reset' });
            }
          } else {
            s.phase = s.suddenDeath ? 'suddendeath' : 'play';
            out.push({ type: 'kickoff' });
          }
        }
        break;
      case 'play':
      case 'suddendeath':
        s.clockMs = Math.max(0, s.clockMs - dtMs);
        if (this.secondsLeft !== this.lastWholeSecond) {
          this.lastWholeSecond = this.secondsLeft;
          out.push({ type: 'clock', secondsLeft: this.secondsLeft });
        }
        if (s.clockMs === 0) {
          if (!s.suddenDeath && s.score[0] === s.score[1]) {
            s.suddenDeath = true;
            s.clockMs = this.suddenDeathSec * 1000;
            s.phase = 'suddendeath_countdown';
            s.phaseTimerMs = this.countdownMs;
            this.lastWholeSecond = -1;
            out.push({ type: 'suddendeath' });
          } else {
            s.phase = 'over';
            s.winner = s.score[0] === s.score[1] ? null : s.score[0] > s.score[1] ? 0 : 1;
            out.push({ type: 'fulltime' });
          }
        }
        break;
      default:
        break;
    }
    return out;
  }

  /** Register a goal; returns false outside a playable phase. */
  goal(scorer) {
    const s = this.state;
    if (!this.isPlaying) return false;
    s.score[scorer] += 1;
    s.phase = 'goal';
    s.phaseTimerMs = this.goalFreezeMs;
    if (s.suddenDeath) s.winner = scorer;
    return true;
  }
};

