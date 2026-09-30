// Web Audio falso para testes unitários (só testes): AudioParams que gravam as automações e
// calculam o valor em cada instante, e um contexto com os nós que as vozes usam.
type Ev =
  | { type: 'set'; time: number; value: number }
  | { type: 'ramp'; time: number; value: number }
  | { type: 'target'; time: number; value: number; tau: number };

export class FakeParam {
  intrinsic: number;
  events: Ev[] = [];
  constructor(
    v: number,
    private clock: { currentTime: number },
  ) {
    this.intrinsic = v;
  }
  get value() {
    return this.at(this.clock.currentTime);
  }
  set value(v: number) {
    this.intrinsic = v;
  }
  private add(e: Ev) {
    this.events.push(e);
    this.events.sort((a, b) => a.time - b.time);
    return this;
  }
  setValueAtTime(value: number, time: number) {
    return this.add({ type: 'set', time, value });
  }
  linearRampToValueAtTime(value: number, time: number) {
    return this.add({ type: 'ramp', time, value });
  }
  /** Aproximada por uma rampa linear (chega para os picos e silêncios que os testes medem). */
  exponentialRampToValueAtTime(value: number, time: number) {
    return this.add({ type: 'ramp', time, value });
  }
  setTargetAtTime(value: number, time: number, tau: number) {
    return this.add({ type: 'target', time, value, tau });
  }
  cancelScheduledValues(time: number) {
    this.events = this.events.filter((e) => e.time < time);
    return this;
  }
  /** Valor em `x`, segundo as regras do Web Audio para estes três tipos de evento. */
  at(x: number): number {
    let cur = (_: number) => this.intrinsic;
    let lastT = -Infinity;
    for (const e of this.events) {
      if (e.type === 'ramp') {
        const v0 = cur(lastT === -Infinity ? e.time : lastT);
        if (x < e.time) {
          if (lastT === -Infinity || x < lastT) return cur(x);
          return v0 + ((e.value - v0) * (x - lastT)) / (e.time - lastT);
        }
        cur = () => e.value;
        lastT = e.time;
        continue;
      }
      if (e.time > x) break;
      if (e.type === 'set') {
        cur = () => e.value;
      } else {
        const v0 = cur(e.time);
        const { time, value, tau } = e;
        cur = (y) => value + (v0 - value) * Math.exp(-(y - time) / tau);
      }
      lastT = e.time;
    }
    return cur(x);
  }
}

export function fakeCtx() {
  const clock = { currentTime: 0 };
  const node = () => ({ connect() {}, disconnect() {} });
  const gains: FakeParam[] = [];
  const stops: number[] = [];
  const ctx = {
    get currentTime() {
      return clock.currentTime;
    },
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: new FakeParam(1, clock),
      start() {},
      stop: (at: number) => stops.push(at),
      onended: null,
    }),
    createBiquadFilter: () => ({
      ...node(),
      type: 'lowpass',
      frequency: new FakeParam(350, clock),
      Q: new FakeParam(1, clock),
    }),
    createGain: () => {
      // o GainNode real começa com o valor intrínseco 1
      const gain = new FakeParam(1, clock);
      gains.push(gain);
      return { ...node(), gain };
    },
    createOscillator: () => ({
      ...node(),
      type: 'sine',
      frequency: new FakeParam(440, clock),
      detune: new FakeParam(0, clock),
      start() {},
      stop: (at: number) => stops.push(at),
    }),
    createStereoPanner: () => ({ ...node(), pan: new FakeParam(0, clock) }),
  };
  return { ctx: ctx as unknown as BaseAudioContext, clock, gains, stops };
}

/** Pico do ganho entre 0 e 3 s, em passos de 0,5 ms. */
export function peakOf(p: FakeParam): number {
  let m = 0;
  for (let x = 0; x <= 3; x += 0.0005) m = Math.max(m, p.at(x));
  return m;
}
