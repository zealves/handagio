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

/** Tempo máximo para carregar um instrumento (manifest incluído); depois passa a `error`. */
export const LOAD_TIMEOUT_MS = 20_000;
/** Instrumentos com buffers em memória; ao carregar mais um, sai o usado há mais tempo. */
export const MAX_LOADED = 6;

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
  /** Instrumentos prontos, do usado há mais tempo para o mais recente. */
  private lru: string[] = [];
  /** Instrumento escolhido: nunca sai da memória. */
  private current: string | null = null;
  private events = new Emitter<{ status: { id: string; status: SampleStatus } }>();

  /** `base` é o BASE_URL do Vite ('./' no build), para funcionar em qualquer pasta. */
  constructor(private base: string = import.meta.env.BASE_URL) {}

  status(id: string): SampleStatus {
    return this.states.get(id) ?? 'idle';
  }

  get(id: string): SampleEntry | null {
    if (this.status(id) !== 'ready') return null;
    this.touch(id);
    return this.entries.get(id) ?? null;
  }

  /**
   * Marca o instrumento escolhido: fica sempre em memória. As vozes que ainda soam guardam a
   * referência ao seu buffer, por isso libertar outro instrumento nunca as corta.
   */
  setCurrent(id: string): void {
    this.current = id;
    if (this.status(id) === 'ready') this.touch(id);
  }

  /** Ids com buffers em memória, do usado há mais tempo para o mais recente (diagnóstico). */
  loaded(): string[] {
    return [...this.lru];
  }

  on(type: 'status', fn: (e: { id: string; status: SampleStatus }) => void): () => void {
    return this.events.on(type, fn);
  }

  /** Idempotente enquanto carrega ou depois de pronto; depois de um erro volta a tentar. */
  load(ctx: DecodeCtx, id: string): Promise<void> {
    const st = this.status(id);
    if (st === 'ready') {
      this.touch(id);
      return Promise.resolve();
    }
    const running = this.pending.get(id);
    if (running) return running;
    this.set(id, 'loading');
    // sem resposta em 20 s (rede pendurada): cancela os pedidos e passa a `error`
    const ac = new AbortController();
    const timer = setTimeout(
      () => ac.abort(new Error(`tempo esgotado (${LOAD_TIMEOUT_MS / 1000} s)`)),
      LOAD_TIMEOUT_MS,
    );
    const p = abortable(this.fetchAll(ctx, id, ac.signal), ac.signal)
      .then((entry) => {
        this.entries.set(id, entry);
        this.set(id, 'ready');
        this.touch(id);
        this.evict();
      })
      .catch((e: unknown) => {
        console.warn(`[amostras] não foi possível carregar "${id}"`, e);
        this.set(id, 'error');
      })
      .finally(() => {
        clearTimeout(timer);
        this.pending.delete(id);
      });
    this.pending.set(id, p);
    return p;
  }

  /** Quando a rede volta, tenta de novo o instrumento escolhido se tiver falhado. */
  retryOnOnline(target: EventTarget, ctx: () => DecodeCtx | null): () => void {
    const on = () => {
      const c = ctx();
      if (c && this.current && this.status(this.current) === 'error')
        void this.load(c, this.current);
    };
    target.addEventListener('online', on);
    return () => target.removeEventListener('online', on);
  }

  private touch(id: string): void {
    const i = this.lru.indexOf(id);
    if (i === this.lru.length - 1 && i >= 0) return;
    if (i >= 0) this.lru.splice(i, 1);
    this.lru.push(id);
  }

  /** Acima do limite, liberta os buffers dos usados há mais tempo (nunca o escolhido). */
  private evict(): void {
    while (this.lru.length > MAX_LOADED) {
      const victim = this.lru.find((id) => id !== this.current);
      if (!victim) return;
      this.lru.splice(this.lru.indexOf(victim), 1);
      this.entries.delete(victim);
      this.set(victim, 'idle');
    }
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
      // partilhado por todos os instrumentos: tem o seu próprio limite de tempo
      const ac = new AbortController();
      const timer = setTimeout(
        () => ac.abort(new Error('manifest: tempo esgotado')),
        LOAD_TIMEOUT_MS,
      );
      const req = fetch(this.url('manifest.json'), { signal: ac.signal }).then(async (r) => {
        if (!r.ok) throw new Error(`manifest: HTTP ${r.status}`);
        return (await r.json()) as Manifest;
      });
      this.manifest = abortable(req, ac.signal);
      this.manifest.then(
        () => clearTimeout(timer),
        () => {
          clearTimeout(timer);
          // sem rede, a próxima tentativa volta a pedir o manifest
          this.manifest = null;
        },
      );
    }
    return this.manifest;
  }

  private async fetchAll(ctx: DecodeCtx, id: string, signal: AbortSignal): Promise<SampleEntry> {
    const inst = (await this.getManifest()).instruments[id];
    if (!inst) throw new Error(`"${id}" não está no manifest`);
    const loaded = await Promise.all(
      Object.keys(inst.notes).map(async (name) => {
        const url = this.url(`${id}/${name}.mp3`);
        const r = await fetch(url, { signal });
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

/** Rejeita logo que `signal` é abortado, mesmo que `p` nunca chegue a responder. */
function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('abortado'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Banco único da aplicação. */
export const samples = new SampleBank();
