// Motor de som: AudioContext, cadeia de saída, vozes, percussão, theremin e envios.
//
//   vozes → bus → seco ─┬─→ post → tom (filtro/drive) → master → compressor → mudo → saída
//               └ boca ─┘                        ├→ reverb ─┘   └→ analisador, gravação
//                                                └→ delay ──┘
import { drumTools } from './drums/types';
import { DRUMS } from './drums';
import { createDelay } from './effects/delay';
import { createMouthFx } from './effects/mouthFx';
import { pitchFactor } from './effects/pitchShift';
import { createReverb } from './effects/reverb';
import { createTone } from './effects/tone';
import { SharedAnalyser } from './analyser';
import { PATCHES } from './patches';
import { SAMPLED_BY_ID } from './samples/catalog';
import { samples } from './samples/loader';
import {
  CHOKE_OTHER,
  CHOKE_SAME,
  chooseVoice,
  playSample,
  sampleSources,
  type SampleVoice,
} from './samples/sampler';
import { midiToFreq } from './theory';
import { playVoice, type Voice, type VoiceDeps } from './voice';
import type { MouthFxId } from '../state/types';

export interface EngineParams {
  volume: number;
  muted: boolean;
  reverb: number;
  echo: number;
  filter: number;
  drive: number;
  pitch: number;
}

export type VoiceKey = number | string;

interface VoiceEntry {
  voice: Voice;
  freq: number;
}

interface ThereminVoice {
  o: OscillatorNode;
  g: GainNode;
  lfo: OscillatorNode;
  nodes: AudioNode[];
}

function makeNoise(ctx: BaseAudioContext, secs: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export class AudioEngine {
  ctx!: AudioContext;
  ready = false;
  analyser!: SharedAnalyser;
  /** Saída final (depois do compressor), para gravação. */
  output!: GainNode;
  private master!: GainNode;
  private speakers!: GainNode;
  private bus!: GainNode;
  private dry!: GainNode;
  private deps!: VoiceDeps;
  private mouth!: ReturnType<typeof createMouthFx>;
  private reverb!: ReturnType<typeof createReverb>;
  private delay!: ReturnType<typeof createDelay>;
  private tone!: ReturnType<typeof createTone>;
  private voices = new Map<VoiceKey, VoiceEntry>();
  /** Última voz com amostras de cada chave, mesmo já largada (a cauda ainda soa). */
  private sampleTails = new Map<VoiceKey, { voice: SampleVoice; midi: number }>();
  /** Cauda anterior de cada chave a descer devagar (dedo que mudou de nota). */
  private fadingTails = new Map<VoiceKey, SampleVoice>();
  private theremin: ThereminVoice[] | null = null;
  private ksCache = new Map<string, AudioBuffer>();
  private params: EngineParams = {
    volume: 0.75,
    muted: false,
    reverb: 0.3,
    echo: 0.15,
    filter: 1,
    drive: 0,
    pitch: 0,
  };

  /** Só depois de um gesto do utilizador. Idempotente. */
  init(): void {
    if (this.ready) return;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.output = ctx.createGain();
    comp.connect(this.output);
    this.speakers = ctx.createGain();
    this.output.connect(this.speakers);
    this.speakers.connect(ctx.destination);
    this.analyser = new SharedAnalyser(ctx);
    this.output.connect(this.analyser.node);

    this.master = ctx.createGain();
    this.master.connect(comp);
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.8;
    const post = ctx.createGain();
    this.dry = ctx.createGain();
    this.bus.connect(this.dry);
    this.dry.connect(post);
    this.mouth = createMouthFx(ctx, this.bus, post, this.dry);
    const toned = ctx.createGain();
    this.tone = createTone(ctx, post, toned);
    toned.connect(this.master);
    this.reverb = createReverb(ctx, toned, this.master);
    this.delay = createDelay(ctx, toned, this.master);

    const noise = makeNoise(ctx, 2);
    this.deps = { ctx, noise, ks: (f, d, s, b) => this.ksBuffer(f, d, s, b) };
    this.ready = true;
    this.applyParams();
    this.unlockOnGesture();
  }

  /**
   * iOS: o som só arranca em gestos que ativam a página (touchend, click, keydown; o
   * pointerdown de toque não conta) e o contexto pode ficar "interrupted" ao abrir a
   * câmara. Em cada gesto destes retoma o contexto e toca um buffer mudo.
   * O audioSession "playback" (Safari 17+) faz o som ignorar o interruptor de silêncio.
   */
  private unlockOnGesture(): void {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'playback';
      } catch {
        /* não suportado */
      }
    }
    const unlock = () => {
      if (this.ctx.state === 'running') return;
      void this.ctx.resume().catch(() => {});
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      src.connect(this.ctx.destination);
      src.start();
    };
    for (const ev of ['touchend', 'click', 'keydown'])
      document.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  async resume(): Promise<void> {
    if (this.ready && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* sem gesto ainda */
      }
    }
  }

  get now(): number {
    return this.ready ? this.ctx.currentTime : 0;
  }

  /** Karplus-Strong com cache dos buffers (guitarra, harpa, cravo). */
  private ksBuffer(freq: number, damp: number, secs: number, bright: boolean): AudioBuffer {
    const key = Math.round(freq * 10) + '_' + damp + '_' + bright;
    const hit = this.ksCache.get(key);
    if (hit) {
      // LRU: volta a pôr no fim
      this.ksCache.delete(key);
      this.ksCache.set(key, hit);
      return hit;
    }
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * secs);
    const b = ctx.createBuffer(1, len, sr);
    const out = b.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const buf = new Float32Array(N);
    let last = 0;
    for (let i = 0; i < N; i++) {
      const r = Math.random() * 2 - 1;
      last = bright ? r : (r + last) * 0.5;
      buf[i] = last;
    }
    let p = 0;
    for (let i = 0; i < len; i++) {
      const n = (p + 1) % N;
      const v = (buf[p] + buf[n]) * 0.5 * damp;
      out[i] = buf[p];
      buf[p] = v;
      p = n;
    }
    // Até 64 buffers (~20 MB): chega para as notas em uso sem crescer sem limite.
    if (this.ksCache.size >= 64) this.ksCache.delete(this.ksCache.keys().next().value!);
    this.ksCache.set(key, b);
    return b;
  }

  // ---------- parâmetros ----------
  setParams(p: Partial<EngineParams>): void {
    const pitchChanged = p.pitch !== undefined && p.pitch !== this.params.pitch;
    Object.assign(this.params, p);
    if (!this.ready) return;
    this.applyParams();
    if (pitchChanged) {
      const k = pitchFactor(this.params.pitch);
      this.voices.forEach(({ voice, freq }) => voice.setFreq(freq * k));
    }
  }

  private applyParams(): void {
    const t = this.ctx.currentTime;
    const p = this.params;
    this.master.gain.setTargetAtTime(p.volume, t, 0.05);
    this.speakers.gain.setTargetAtTime(p.muted ? 0 : 1, t, 0.02);
    this.reverb.set(p.reverb, t);
    this.delay.set(p.echo, t);
    this.tone.setFilter(p.filter, t);
    this.tone.setDrive(p.drive, t);
  }

  setDelayTime(secs: number): void {
    if (this.ready) this.delay.setTime(secs, this.ctx.currentTime);
  }

  setMouth(amount: number, fx: MouthFxId): void {
    if (this.ready) this.mouth.apply(amount, fx, this.ctx.currentTime);
  }

  // ---------- vozes melódicas ----------
  noteOn(
    key: VoiceKey,
    patchId: string,
    midi: number,
    vel: number,
    pan: number,
    when?: number,
  ): void {
    if (!this.ready) return;
    const def = SAMPLED_BY_ID[patchId];
    const sampled = def && chooseVoice(samples.status(def.id), def) === 'sample';
    const bank = sampled ? samples.get(def.id) : null;
    // enquanto as amostras não chegam (ou se falharam) soa o patch de reserva; o primeiro
    // uso começa a carregá-las em segundo plano (depois de um erro, só se volta a tentar ao
    // escolher o instrumento outra vez)
    if (def && samples.status(def.id) === 'idle') void samples.load(this.ctx, def.id);
    const patch = bank ? null : PATCHES[def ? def.fallback : patchId];
    if (!bank && (!patch || patch.continuous)) return;
    const freq = midiToFreq(midi);
    const f = freq * pitchFactor(this.params.pitch);
    // a mesma chave (o mesmo dedo) volta a tocar: a amostra anterior, ainda a soar ou já
    // largada, é abafada quando a nova começa. A mesma nota abafa depressa (corda tocada de
    // novo); outra nota deixa uma cauda curta e natural (arpejos). Por chave fica no máximo
    // uma voz ativa e uma cauda a descer devagar.
    this.noteOff(key);
    const at = Math.max(when ?? 0, this.ctx.currentTime);
    this.fadingTails.get(key)?.choke(at, CHOKE_SAME);
    this.fadingTails.delete(key);
    const tail = this.sampleTails.get(key);
    if (tail) {
      const same = tail.midi === midi;
      tail.voice.choke(at, same ? CHOKE_SAME : CHOKE_OTHER);
      if (!same) this.fadingTails.set(key, tail.voice);
    }
    this.sampleTails.delete(key);
    let voice: Voice;
    if (bank) {
      const sv = playSample(this.ctx, bank, def, this.bus, f, vel, pan, when);
      this.sampleTails.set(key, { voice: sv, midi });
      voice = sv;
    } else {
      voice = playVoice(this.deps, patch!, this.bus, f, vel, pan, when);
    }
    const entry: VoiceEntry = { voice, freq };
    voice.onDone = () => {
      if (this.voices.get(key) === entry) this.voices.delete(key);
      if (this.sampleTails.get(key)?.voice === voice) this.sampleTails.delete(key);
      if (this.fadingTails.get(key) === voice) this.fadingTails.delete(key);
    };
    this.voices.set(key, entry);
  }

  noteOff(key: VoiceKey): void {
    const e = this.voices.get(key);
    if (!e) return;
    e.voice.release();
    this.voices.delete(key);
  }

  /** Deslizar o tom de uma nota sustentada. */
  glide(key: VoiceKey, midi: number): void {
    const e = this.voices.get(key);
    if (!e || !e.voice.sustain) return;
    e.freq = midiToFreq(midi);
    e.voice.setFreq(e.freq * pitchFactor(this.params.pitch));
  }

  hasVoice(key: VoiceKey): boolean {
    return this.voices.has(key);
  }

  /** Corta todas as vozes (mudança de instrumento, polegares). */
  releaseAll(): void {
    this.voices.forEach(({ voice }) => voice.release());
    this.voices.clear();
    this.silenceContinuous();
  }

  get activeVoices(): number {
    return this.voices.size;
  }

  /** Fontes de amostras ainda a soar, incluindo caudas já largadas (diagnóstico). */
  get sampleSources(): number {
    return sampleSources();
  }

  // ---------- percussão ----------
  drum(kitId: string, slot: number, vel: number, pan = 0, when?: number): void {
    if (!this.ready) return;
    const kit = DRUMS[kitId];
    if (!kit || slot < 0 || !kit.sounds[slot]) return;
    const ctx = this.ctx;
    const t = Math.max(when ?? 0, ctx.currentTime);
    const out = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    out.connect(p);
    p.connect(this.bus);
    const nodes: AudioNode[] = [out, p];
    let last = t;
    const track = (n: AudioNode) => nodes.push(n);
    const d = drumTools(
      ctx,
      t,
      out,
      this.deps.noise,
      0.2 + 0.8 * vel,
      pitchFactor(this.params.pitch),
      track,
    );
    // mede o fim do som mais longo para desligar tudo depois
    const wrap = {
      tone: (...a: Parameters<typeof d.tone>) => {
        last = Math.max(last, t + (a[5] ?? 0) + a[2] + 0.05);
        d.tone(...a);
      },
      noise: (...a: Parameters<typeof d.noise>) => {
        last = Math.max(last, t + (a[5] ?? 0) + a[0] + 0.05);
        d.noise(...a);
      },
      clap: () => {
        last = Math.max(last, t + 0.036 + 0.18 + 0.05);
        d.clap();
      },
    };
    kit.sounds[slot](wrap);
    setTimeout(() => nodes.forEach((n) => n.disconnect()), (last - ctx.currentTime) * 1000 + 150);
  }

  // ---------- theremin (contínuo) ----------
  private ensureTheremin(): ThereminVoice[] {
    if (this.theremin) return this.theremin;
    const ctx = this.ctx;
    this.theremin = Array.from({ length: 10 }, (_, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      const p = ctx.createStereoPanner();
      o.type = i < 5 ? 'sine' : 'triangle';
      lfo.frequency.value = 5 + Math.random();
      lg.gain.value = 4;
      lfo.connect(lg);
      lg.connect(o.frequency);
      g.gain.value = 0;
      o.connect(g);
      p.pan.value = (i - 4.5) / 6;
      g.connect(p);
      p.connect(this.bus);
      o.start();
      lfo.start();
      return { o, g, lfo, nodes: [o, g, lfo, lg, p] };
    });
    return this.theremin;
  }

  /** level 0..1 → ganho level² × 0.18 (valor do protótipo). */
  continuous(i: number, midi: number, level: number): void {
    if (!this.ready) return;
    const v = this.ensureTheremin()[i];
    const t = this.ctx.currentTime;
    v.o.frequency.setTargetAtTime(midiToFreq(midi) * pitchFactor(this.params.pitch), t, 0.05);
    v.g.gain.setTargetAtTime(level * level * 0.18, t, level > 0 ? 0.05 : 0.1);
  }

  silenceContinuous(): void {
    if (!this.theremin) return;
    const t = this.ctx.currentTime;
    this.theremin.forEach((v) => v.g.gain.setTargetAtTime(0, t, 0.1));
  }

  /** Desliga as 10 vozes do theremin quando se muda de instrumento. */
  destroyTheremin(): void {
    const th = this.theremin;
    if (!th) return;
    this.theremin = null;
    const t = this.ctx.currentTime;
    th.forEach((v) => v.g.gain.setTargetAtTime(0, t, 0.05));
    setTimeout(() => {
      th.forEach((v) => {
        v.o.stop();
        v.lfo.stop();
        v.nodes.forEach((n) => n.disconnect());
      });
    }, 400);
  }

  // ---------- metrónomo ----------
  click(when: number, accent: boolean): void {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.12, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
    o.connect(g);
    // o metrónomo vai direto às colunas: não passa pelos efeitos nem entra na gravação
    g.connect(this.speakers);
    o.start(when);
    o.stop(when + 0.06);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
}

export const audio = new AudioEngine();
