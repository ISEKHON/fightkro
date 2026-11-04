// Rollback netcode (GGPO-style): local input is applied after a small delay, the remote input is
// predicted (repeat last known), and when the real remote input arrives and differs we restore
// the saved state for that frame and re-simulate up to the present.
import { cloneState, createMatch, hashState, step } from '../sim/sim';
import type { GameEvent, MatchCfg, MatchState } from '../sim/types';
import type { Driver } from '../game';
import type { NetClient, NetMsg } from './net';

const RING = 128;
const MAX_PREDICT = 10;

export class RollbackDriver implements Driver {
  s: MatchState;
  localSide: 0 | 1;
  delay: number;
  local: number[] = [];
  remote: number[] = [];
  remoteKnown = -1;
  states: (MatchState | null)[] = new Array(RING).fill(null);
  predictedUsed: number[] = [];
  rollbackFrom = Infinity;
  rollbacks = 0;
  stalls = 0;
  remoteAhead = 0;
  desync = false;
  private hashes = new Map<number, number>();
  private off: () => void;
  confirmedLog: number[] = [];
  onSpectatorBatch?: (from: number, inputs: number[]) => void;
  lastRemoteMsg = performance.now();
  private specSent = 0;

  constructor(public net: NetClient, cfg: MatchCfg, side: 0 | 1, delay = 2) {
    this.s = createMatch(cfg);
    this.localSide = side;
    this.delay = delay;
    for (let i = 0; i < delay; i++) this.local[i] = 0;
    this.off = net.on((m) => this.onMsg(m));
  }

  private onMsg(m: NetMsg) {
    if (m.t === 'in') {
      this.lastRemoteMsg = performance.now();
      const from = m.f as number;
      const arr = m.i as number[];
      for (let k = 0; k < arr.length; k++) {
        const f = from + k;
        if (f <= this.remoteKnown) continue;
        if (f !== this.remoteKnown + 1) break;
        this.remote[f] = arr[k];
        this.remoteKnown = f;
        // did we predict this frame wrongly?
        if (f < this.s.frame && this.predictedUsed[f] !== undefined && this.predictedUsed[f] !== arr[k]) this.rollbackFrom = Math.min(this.rollbackFrom, f);
      }
      this.remoteAhead = (m.cur as number) - this.s.frame;
      this.net.send({ t: 'ack', f: this.remoteKnown });
    } else if (m.t === 'hash') {
      const mine = this.hashes.get(m.f as number);
      if (mine !== undefined && mine !== m.h) this.desync = true;
    }
  }

  private inputsFor(f: number): [number, number] {
    const l = this.local[f] ?? 0;
    let r: number;
    if (f <= this.remoteKnown) r = this.remote[f];
    else {
      r = this.remoteKnown >= 0 ? this.remote[this.remoteKnown] : 0;
      this.predictedUsed[f] = r;
    }
    if (f <= this.remoteKnown) this.predictedUsed[f] = r;
    return this.localSide === 0 ? [l, r] : [r, l];
  }

  tick(localInput: number): { state: MatchState; events: GameEvent[] } | null {
    const cur = this.s.frame;
    // stall if we're too far ahead of the remote player
    if (cur - this.remoteKnown > MAX_PREDICT) {
      this.stalls++;
      this.sendInputs();
      return { state: this.s, events: [] };
    }
    // time sync: if we're consistently ahead, wait a frame now and then
    if (this.remoteAhead < -2 && cur % 8 === 0) {
      this.remoteAhead++;
      this.sendInputs();
      return { state: this.s, events: [] };
    }
    this.local[cur + this.delay] = localInput;
    this.sendInputs();

    if (this.rollbackFrom < cur) {
      const from = this.rollbackFrom;
      const snap = this.states[from % RING];
      if (snap && snap.frame === from) {
        this.rollbacks++;
        this.s = cloneState(snap);
        while (this.s.frame < cur) {
          const f = this.s.frame;
          this.states[f % RING] = cloneState(this.s);
          step(this.s, this.inputsFor(f));
        }
      }
      this.rollbackFrom = Infinity;
    }
    const f = this.s.frame;
    this.states[f % RING] = cloneState(this.s);
    step(this.s, this.inputsFor(f));
    // confirmed frames: hash exchange for desync detection + spectator feed
    const confirmed = Math.min(this.remoteKnown, this.s.frame - 1);
    if (confirmed > 0 && confirmed % 120 === 0 && !this.hashes.has(confirmed)) {
      const snap = this.states[(confirmed + 1) % RING];
      if (snap && snap.frame === confirmed + 1) {
        const h = hashState(snap);
        this.hashes.set(confirmed, h);
        this.net.send({ t: 'hash', f: confirmed, h });
      }
    }
    if (this.localSide === 0 && this.onSpectatorBatch && confirmed - this.specSent >= 30) {
      const batch: number[] = [];
      for (let k = this.specSent; k < confirmed; k++) {
        const [a, b] = [this.local[k] ?? 0, this.remote[k] ?? 0];
        batch.push(a, b);
      }
      this.onSpectatorBatch(this.specSent, batch);
      this.specSent = confirmed;
    }
    return { state: this.s, events: this.s.events };
  }

  private sendInputs() {
    // send the last few frames redundantly (unreliable channel)
    const end = this.s.frame + this.delay;
    const start = Math.max(0, end - 12);
    const arr: number[] = [];
    for (let f = start; f <= end; f++) arr.push(this.local[f] ?? 0);
    this.net.send({ t: 'in', f: start, i: arr, cur: this.s.frame });
  }

  status() {
    const ping = this.net.p2p ? 'P2P' : 'RELAY';
    return `${ping} · delay ${this.delay}f · rollbacks ${this.rollbacks}${this.desync ? ' · DESYNC!' : ''}`;
  }

  dispose() {
    this.off();
  }
}

/** Plays a match from a stream of confirmed input batches (spectating), a few seconds behind. */
export class SpectatorDriver implements Driver {
  s: MatchState | null = null;
  inputs: number[] = [];
  private off: () => void;
  constructor(net: NetClient, private delayFrames = 180) {
    this.off = net.on((m) => {
      if (m.t === 'spec') {
        const d = m.data as { cfg?: MatchCfg; from: number; i: number[] };
        if (d.cfg && !this.s) this.s = createMatch(d.cfg);
        for (let k = 0; k < d.i.length; k++) this.inputs[d.from * 2 + k] = d.i[k];
      }
    });
  }
  tick(): { state: MatchState; events: GameEvent[] } | null {
    if (!this.s) return null;
    const have = Math.floor(this.inputs.length / 2);
    if (have - this.s.frame < (this.s.frame === 0 ? this.delayFrames : 1)) return { state: this.s, events: [] };
    const f = this.s.frame;
    step(this.s, [this.inputs[f * 2] ?? 0, this.inputs[f * 2 + 1] ?? 0]);
    return { state: this.s, events: this.s.events };
  }
  status() {
    return 'SPECTATING';
  }
  dispose() {
    this.off();
  }
}
