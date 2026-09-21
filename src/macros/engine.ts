/**
 * Delkol — simulation engine ported from neverfish (Rust, Tauri).
 *
 * The original bot drives a real game: screen capture → pixel detection →
 * a four-state machine per catch → humanized SendInput. Delkol runs the same
 * algorithms against a simulated game model, one tick per second, and turns
 * the raw state stream into human-readable cycle details.
 *
 * Ports from neverfish:
 *   • four-state machine        (src-tauri/src/state_machine/mod.rs)
 *   • cast / hook with verify   (state_machine/cast.rs)
 *   • minigame controller       (state_machine/minigame.rs):
 *       ArrowHistory   — weighted-slope velocity (newer samples weigh more)
 *       FishProfile    — learns CALM vs NERVOUS fish after N ticks
 *       dead zone, coasting, reverse cooldown, emergency override,
 *       adverse boost, ±15% hold jitter
 *   • dismiss-with-verify       (state_machine/catch.rs)
 *   • watchdogs & limits        (mod.rs / commands.rs)
 */

// ---------------------------------------------------------------------------
// Shared tuning constants (neverfish values)
// ---------------------------------------------------------------------------

/** A free re-cast beats stalling on a missed visual signal. */
export const WAIT_BITE_FALLBACK_SECS = 10;
/** No-progress watchdog — covers stuck loops per-state timeouts miss. */
export const IDLE_WATCHDOG_SECS = 75;
/** Minigame hard cap. */
export const MINIGAME_TIMEOUT_SECS = 30;
/** Neverfish's re-classify pause after F (scaled 500ms → 1s tick). */
export const HOOK_VERIFY_SECS = 1;
export const HOOK_RETRIES = 2;
export const POPUP_DISMISS_ATTEMPTS = 3;
export const POPUP_VERIFY_DELAY_SECS = 0.4;

// --- minigame.rs constants ---
const MINIGAME_DEAD_DIVISOR = 8;
const MINIGAME_VELOCITY_LOOKAHEAD = 2;
const MINIGAME_REVERSE_COOLDOWN_TICKS = 2; // 60ms → 2 ticks of ~80ms
const MINIGAME_ADVERSE_BOOST = 0.14;
const MINIGAME_MAX_BOOST_MULT = 3;
const MINIGAME_PREDICTIVE_TICKS = 1;
const MINIGAME_EMERGENCY_OFFSET_PCT = 0.7;
const ARROW_HISTORY_LEN = 5;

const PROFILE_LEARN_TICKS = 10;
const PROFILE_NERVOUS_DY = 5;

const PROFILE_CALM = { deadDivisor: 10, adverseBoost: 0.06, velocityLookahead: 3 };
const PROFILE_NERVOUS = { deadDivisor: 6, adverseBoost: 0.18, velocityLookahead: 2 };
const PROFILE_DEFAULT = { deadDivisor: MINIGAME_DEAD_DIVISOR, adverseBoost: MINIGAME_ADVERSE_BOOST, velocityLookahead: MINIGAME_VELOCITY_LOOKAHEAD };

// ---------------------------------------------------------------------------
// Humanized random helpers (input.rs jitter)
// ---------------------------------------------------------------------------

/** Uniform min..=max, like rand::random_range. */
export function jitterMs(minMs: number, maxMs: number): number {
  return minMs + Math.floor(Math.random() * (Math.max(maxMs, minMs) - minMs + 1));
}

// ---------------------------------------------------------------------------
// ArrowHistory — weighted-slope velocity from the last N samples
// ---------------------------------------------------------------------------

/** Newer pairs weigh more so direction changes propagate fast, but a single
 *  noisy frame can't flip the sign on its own. */
export class ArrowHistory {
  private samples: Array<{ y: number; t: number }> = [];

  reset() { this.samples = []; }
  push(y: number, t: number) {
    if (this.samples.length === ARROW_HISTORY_LEN) this.samples.shift();
    this.samples.push({ y, t });
  }

  /** Pixels per 80ms tick. Returns 0 with fewer than 2 samples. */
  velocity(): number {
    if (this.samples.length < 2) return 0;
    let sumW = 0;
    let sumWv = 0;
    for (let i = 1; i < this.samples.length; i += 1) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      const dt = Math.max(1, b.t - a.t);
      const v = ((b.y - a.y) * 80) / dt;
      const w = i;
      sumW += w;
      sumWv += w * v;
    }
    return sumWv / sumW;
  }

  predict(current: number, ticks: number): number {
    return Math.round(current + this.velocity() * ticks);
  }
}

// ---------------------------------------------------------------------------
// FishProfile — per-fish behaviour observer (smart memory L1)
// ---------------------------------------------------------------------------

type ControlProfile = { deadDivisor: number; adverseBoost: number; velocityLookahead: number };

export class FishProfile {
  private ticks = 0;
  private sumAbsDy = 0;
  private committed: ControlProfile | null = null;

  reset() {
    this.ticks = 0;
    this.sumAbsDy = 0;
    this.committed = null;
  }

  record(dy: number) {
    this.ticks += 1;
    this.sumAbsDy += Math.abs(dy);
  }

  /** Commits to CALM or NERVOUS after PROFILE_LEARN_TICKS and stops re-deciding. */
  commit(): ControlProfile & { name: 'calm' | 'nervous' | 'default' } {
    if (this.committed) return { ...this.committed, name: this.committed === PROFILE_CALM ? 'calm' : 'nervous' };
    if (this.ticks < PROFILE_LEARN_TICKS) return { ...PROFILE_DEFAULT, name: 'default' as const };
    const avg = this.sumAbsDy / this.ticks;
    const profile = avg >= PROFILE_NERVOUS_DY ? PROFILE_NERVOUS : PROFILE_CALM;
    this.committed = profile;
    return { ...profile, name: avg >= PROFILE_NERVOUS_DY ? 'nervous' : 'calm' };
  }
}

// ---------------------------------------------------------------------------
// Fishing state machine (simulated game vision)
// ---------------------------------------------------------------------------

export type FishingState = 'idle' | 'waitBite' | 'bite' | 'minigame' | 'waitCatch';

/** How a simulated fish behaves — drives bar width, arrow drift and patience. */
interface FishSim {
  patience: number;
  barWidth: number;
  nervous: boolean;
}

export const FISHING_POLL_MS = 80; // neverfish poll_interval_ms
export const POLLS_PER_TICK = Math.round(1000 / FISHING_POLL_MS);

export interface FishingSimTick {
  bite: boolean;
  bar: { yellow: number; left: number; right: number } | null;
}

/**
 * Simulates the parts of the game the original bot "sees", at the same 80ms
 * polling granularity: blue bite arc, A/D balance bar with a drifting yellow
 * arrow, catch popup. Holds shift the arrow toward the green center; the fish
 * fights back with mood-driven drift and may escape after enough strain.
 */
export class FishingSim {
  state: FishingState = 'idle';
  /** Set when the bar disappears: 'landed' = catch, 'escaped' = failure. */
  outcome: 'landed' | 'escaped' | null = null;
  private polls = 0;
  private bitePolls = 0;
  private strain = 0;
  private centered = 0;
  private yellow = 400;
  private yellowTarget = 400;
  private left = 260;
  private right = 540;
  private fish: FishSim = { patience: 14, barWidth: 280, nervous: false };
  private holdUntil = 0;
  private holding: 'A' | 'D' | null = null;

  cast() {
    this.state = 'waitBite';
    this.bitePolls = 0;
    this.strain = 0;
    this.centered = 0;
    this.outcome = null;
    this.fish = {
      patience: jitterMs(4, 12),   // seconds until the bite
      barWidth: jitterMs(220, 320),
      nervous: Math.random() < 0.4,
    };
  }

  hook(connected: boolean) {
    this.outcome = null;
    if (connected) {
      this.state = 'minigame';
      const half = this.fish.barWidth / 2;
      this.left = 400 - half;
      this.right = 400 + half;
      this.yellow = 400 + jitterMs(-30, 30);
      this.yellowTarget = this.left + 40 + Math.random() * (this.fish.barWidth - 80);
      this.strain = 0;
    } else {
      this.state = 'idle';
    }
  }

  /** Controller input applied back onto the world. */
  applyHold(key: 'A' | 'D', holdMs: number) {
    this.holding = key;
    this.holdUntil = this.polls + Math.max(1, Math.round(holdMs / FISHING_POLL_MS));
  }

  /** Advance the world by one poll (80ms). Returns what the bot "sees". */
  poll(): FishingSimTick {
    this.polls += 1;
    if (this.state === 'waitBite') {
      this.bitePolls += 1;
      // Bite arrives after the fish's patience (in seconds) has elapsed.
      if (this.bitePolls >= this.fish.patience * (1000 / FISHING_POLL_MS)) {
        this.state = 'bite';
        return { bite: true, bar: null };
      }
      return { bite: false, bar: null };
    }
    if (this.state === 'minigame') {
      // Fish mood: the target wanders; nervous fish pull harder.
      if (Math.random() < 0.12) this.yellowTarget = this.left + 30 + Math.random() * (this.right - this.left - 60);
      const pull = (this.fish.nervous ? 2.6 : 1.4) * (this.yellow < this.yellowTarget ? 1 : -1);
      this.yellow += pull * jitterMs(4, 12);
      // Holding the key drags the arrow the other way (A = left, D = right).
      if (this.holding && this.polls < this.holdUntil) this.yellow += this.holding === 'A' ? -14 : 14;
      else this.holding = null;
      this.yellow = Math.max(this.left - 18, Math.min(this.right + 18, this.yellow));
      // Strain: off-center load + nervous fish tire the line toward escape.
      const center = (this.left + this.right) / 2;
      const off = Math.abs(this.yellow - center) / ((this.right - this.left) / 2);
      this.strain += off * (this.fish.nervous ? 0.045 : 0.025);
      // Good centering tires the fish out and lands it (neverfish: bar gone
      // → WaitCatch). Keep the arrow inside ~30% of center long enough.
      if (off < 0.3) this.centered += 1 / (1000 / FISHING_POLL_MS);
      else this.centered = Math.max(0, this.centered - 0.5 / (1000 / FISHING_POLL_MS));
      if (this.centered >= Math.max(2.5, this.fish.patience * 0.4)) {
        this.outcome = 'landed';
        this.state = 'waitCatch';
        return { bite: false, bar: null };
      }
      if (this.strain >= 1) {
        this.outcome = 'escaped';
        this.state = 'idle';
        return { bite: false, bar: null };
      }
      return { bite: false, bar: { yellow: Math.round(this.yellow), left: this.left, right: this.right } };
    }
    return { bite: false, bar: null };
  }

  /** Fish escapes when accumulated strain crosses its limit. */
  escaped(): boolean {
    return this.state === 'minigame' && this.strain >= 1;
  }

  land() { this.state = 'waitCatch'; }
  dismissPopup() { this.state = 'idle'; }
  getStrain() { return this.strain; }
  /** Catch weight in kg, derived from the fish that was hooked. */
  catchWeight(bait: 'universal' | 'insects' | 'lure'): number {
    const base = this.fish.nervous ? [1.4, 3.2, 6.5, 9.8, 14][jitterMs(0, 4)] : [0.8, 2.1, 4.6, 7.5, 12][jitterMs(0, 4)];
    const k = bait === 'lure' ? 1.3 : bait === 'insects' ? 0.85 : 1;
    return Math.round(base * k * 10) / 10;
  }
}

// ---------------------------------------------------------------------------
// Minigame controller — the A/D balance P-controller, direct port
// ---------------------------------------------------------------------------

export interface MinigameDecision {
  /** null = no press (centered / coasting / cooldown) */
  key: 'A' | 'D' | null;
  holdMs: number;
  detail: string;
  profileName: 'calm' | 'nervous' | 'default';
}

export class MinigameController {
  private history = new ArrowHistory();
  private profile = new FishProfile();
  private lastKey: 'A' | 'D' | null = null;
  private lastPressTick = 0;
  private tick = 0;

  reset() {
    this.history.reset();
    this.profile.reset();
    this.lastKey = null;
    this.lastPressTick = -99;
    this.tick = 0;
  }

  /** One controller step for the sampled bar. `t` is the sample timestamp (ms). */
  step(yellow: number, gLeft: number, gRight: number, t: number, tickMin: number, tickMax: number): MinigameDecision {
    this.tick += 1;
    this.history.push(yellow, t);
    const v = this.history.velocity();
    const dy = Math.round(v);
    const learned = this.profile.commit();
    this.profile.record(dy);

    const barWidth = Math.max(1, gRight - gLeft);
    const center = (gLeft + gRight) / 2;
    const half = Math.max(1, Math.floor(barWidth / 2));

    const predicted = this.history.predict(yellow, MINIGAME_PREDICTIVE_TICKS);
    const offset = predicted - center;
    const absOff = Math.abs(offset);
    const innerDead = Math.max(1, Math.floor(barWidth / learned.deadDivisor));

    if (absOff <= innerDead) return { key: null, holdMs: 0, detail: `center (off=${offset}/${barWidth})`, profileName: learned.name };

    const key = offset < 0 ? 'D' : 'A';
    const movingCorrectly = key === 'D' ? dy > 0 : dy < 0;
    const velocityAbs = Math.abs(dy);
    if (movingCorrectly && velocityAbs * learned.velocityLookahead >= absOff) {
      return { key: null, holdMs: 0, detail: `coasting (off=${offset} v=${dy})`, profileName: learned.name };
    }

    const emergency = absOff / half >= MINIGAME_EMERGENCY_OFFSET_PCT;
    if (!emergency && this.lastKey && key !== this.lastKey && this.tick - this.lastPressTick < MINIGAME_REVERSE_COOLDOWN_TICKS) {
      return { key: null, holdMs: 0, detail: `hold (${key} cooldown, off=${offset})`, profileName: learned.name };
    }

    const pct = Math.min(1, absOff / half);
    const msMin = tickMin;
    const msMax = Math.max(tickMax, tickMin);
    let ms = msMin + (msMax - msMin) * Math.pow(pct, 0.6);

    const adverse = key === 'D' ? dy < 0 : dy > 0;
    if (adverse && velocityAbs > 0) {
      const boost = Math.min(MINIGAME_MAX_BOOST_MULT, 1 + velocityAbs * learned.adverseBoost);
      ms *= boost;
    }
    ms = Math.min(msMax * MINIGAME_MAX_BOOST_MULT, ms);
    ms = Math.max(msMin, ms);

    // ±15% jitter — reduces detectability and smooths repeated taps.
    const jitterSpan = Math.floor(ms * 0.15);
    if (jitterSpan > 0) ms = jitterMs(Math.max(1, Math.floor(ms - jitterSpan)), Math.ceil(ms + jitterSpan));

    this.lastKey = key;
    this.lastPressTick = this.tick;
    return { key, holdMs: Math.round(ms), detail: `press ${key} ${Math.round(ms)}ms (off=${offset}/${barWidth} v=${dy})`, profileName: learned.name };
  }
}

// ---------------------------------------------------------------------------
// Watchdog
// ---------------------------------------------------------------------------

/** Resettable no-progress watchdog (mod.rs IDLE_WATCHDOG_SECS). */
export class Watchdog {
  private last = 0;
  constructor(private limitSecs: number) { this.last = 0; }
  note() { this.last = 0; }
  advance(deltaSecs: number): boolean {
    this.last += deltaSecs;
    return this.last >= this.limitSecs;
  }
}

export const NEVERFISH = {
  WAIT_BITE_FALLBACK_SECS,
  IDLE_WATCHDOG_SECS,
  MINIGAME_TIMEOUT_SECS,
  HOOK_VERIFY_SECS,
  HOOK_RETRIES,
  POPUP_DISMISS_ATTEMPTS,
  POPUP_VERIFY_DELAY_SECS,
} as const;
