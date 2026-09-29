// Carregamento das amostras gravadas: lê o manifest uma vez e, quando um instrumento é
// escolhido, descarrega e descodifica todas as notas em paralelo. Nunca lança para fora: se
// alguma coisa falhar, o estado passa a `error` e o motor continua com o patch de reserva.
import { Emitter } from '../../lib/emitter';
import { noteToMidi } from './notes';

export type SampleStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SampleEntry {
  /** Notas MIDI com amostra, por ordem crescente. */
  notes: number[];
  buffers: Map<number, AudioBuffer>;
  /** Segundos de silêncio do codificador no início de cada amostra (a reprodução salta-os). */
  offsets: Map<number, number>;
  gain: number;
}

interface Manifest {
  version: number;
  instruments: Record<string, { notes: Record<string, number>; gain: number }>;
}

export type DecodeCtx = Pick<BaseAudioContext, 'decodeAudioData'>;

/** Limiar e janela da procura do início do som (MP3 traz ~25 ms de silêncio do codificador). */
const SILENCE_THRESHOLD = 1e-3;
const SILENCE_MAX_SECS = 0.1;

/** Segundos até à primeira amostra audível, procurando só nos primeiros 100 ms; senão 0. */
export function leadingSilence(data: Float32Array, sampleRate: number): number {
  const max = Math.min(data.length, Math.floor(sampleRate * SILENCE_MAX_SECS));
  for (let i = 0; i < max; i++) if (Math.abs(data[i]) > SILENCE_THRESHOLD) return i / sampleRate;
  return 0;
}

export class SampleBank {
  private states = new Map<string, SampleStatus>();
  private entries = new Map<string, SampleEntry>();
  private pending = new Map<string, Promise<void>>();
  private manifest: Promise<Manifest> | null = null;
  private events = new Emitter<{ status: { id: string; status: SampleStatus } }>();

  /** `base` é o BASE_URL do Vite ('./' no build), para funcionar em qualquer pasta. */
  constructor(private base: string = import.meta.env.BASE_URL) {}

  status(id: string): SampleStatus {
    return this.states.get(id) ?? 'idle';
  }

  get(id: string): SampleEntry | null {
    return this.status(id) === 'ready' ? (this.entries.get(id) ?? null) : null;
  }

  on(type: 'status', fn: (e: { id: string; status: SampleStatus }) => void): () => void {
    return this.events.on(type, fn);
  }

  /** Idempotente enquanto carrega ou depois de pronto; depois de um erro volta a tentar. */
  load(ctx: DecodeCtx, id: string): Promise<void> {
    const st = this.status(id);
    if (st === 'ready') return Promise.resolve();
    const running = this.pending.get(id);
    if (running) return running;
    this.set(id, 'loading');
    const p = this.fetchAll(ctx, id)
      .then((entry) => {
        this.entries.set(id, entry);
        this.set(id, 'ready');
      })
      .catch((e: unknown) => {
        console.warn(`[amostras] não foi possível carregar "${id}"`, e);
        this.set(id, 'error');
      })
      .finally(() => this.pending.delete(id));
    this.pending.set(id, p);
    return p;
  }

  private set(id: string, status: SampleStatus): void {
    if (this.states.get(id) === status) return;
    this.states.set(id, status);
    this.events.emit('status', { id, status });
  }

  private url(path: string): string {
    return `${this.base}samples/${path}`;
  }

  private getManifest(): Promise<Manifest> {
    if (!this.manifest) {
      this.manifest = fetch(this.url('manifest.json')).then(async (r) => {
        if (!r.ok) throw new Error(`manifest: HTTP ${r.status}`);
        return (await r.json()) as Manifest;
      });
      // sem rede, a próxima tentativa volta a pedir o manifest
      this.manifest.catch(() => (this.manifest = null));
    }
    return this.manifest;
  }

  private async fetchAll(ctx: DecodeCtx, id: string): Promise<SampleEntry> {
    const inst = (await this.getManifest()).instruments[id];
    if (!inst) throw new Error(`"${id}" não está no manifest`);
    const loaded = await Promise.all(
      Object.keys(inst.notes).map(async (name) => {
        const url = this.url(`${id}/${name}.mp3`);
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        const buf = await ctx.decodeAudioData(await r.arrayBuffer());
        return { midi: noteToMidi(name), buf };
      }),
    );
    loaded.sort((a, b) => a.midi - b.midi);
    const entry: SampleEntry = {
      notes: loaded.map((l) => l.midi),
      buffers: new Map(),
      offsets: new Map(),
      gain: inst.gain,
    };
    for (const { midi, buf } of loaded) {
      entry.buffers.set(midi, buf);
      entry.offsets.set(midi, leadingSilence(buf.getChannelData(0), buf.sampleRate));
    }
    return entry;
  }
}

/** Banco único da aplicação. */
export const samples = new SampleBank();
