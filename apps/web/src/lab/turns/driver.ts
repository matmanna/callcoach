import type { RawTurn } from "@sc/shared";

/** Clock-only playback helper. Emits each turn once when elapsed * speed reaches its timestamp. */
export class TranscriptDriver {
  private startAt = 0;
  private anchorElapsed = 0;
  private index = 0;
  private speed = 1;
  private running = false;
  constructor(private readonly turns: readonly RawTurn[], private readonly emit: (turn: RawTurn) => void, private readonly now: () => number = () => performance.now()) {}
  start(index = this.index) { this.index = index; this.anchorElapsed = this.turns[this.index]?.t ?? 0; this.startAt = this.now(); this.running = true; }
  setSpeed(speed: number) { const elapsed = this.elapsed(); this.anchorElapsed = elapsed; this.startAt = this.now(); this.speed = speed; }
  pause() { if (!this.running) return; this.anchorElapsed = this.elapsed(); this.startAt = this.now(); this.running = false; }
  resume() { if (this.running) return; this.startAt = this.now(); this.running = true; }
  elapsed() { return this.anchorElapsed + (this.running ? Math.max(0, this.now() - this.startAt) * this.speed : 0); }
  tick() { const elapsed = this.elapsed(); while (this.index < this.turns.length && elapsed >= (this.turns[this.index]?.t ?? Infinity)) { const turn = this.turns[this.index++]; if (turn) this.emit(turn); } }
  step() { const turn = this.turns[this.index++]; if (turn) this.emit(turn); }
  get cursor() { return this.index; }
  reset() { this.index = 0; this.anchorElapsed = 0; this.startAt = this.now(); this.running = false; }
}
