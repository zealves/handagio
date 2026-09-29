import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leadingSilence, SampleBank, type DecodeCtx } from './loader';

const MANIFEST = {
  version: 1,
  instruments: {
    violin: { source: 'violin', origin: 'x', notes: { A4: 3, C5: 3, E5: 3 }, gain: 0.8 },
  },
};

/** Buffer falso: 10 amostras de silêncio e depois som. */
function fakeBuffer(): AudioBuffer {
  const data = new Float32Array(1000);
  for (let i = 10; i < data.length; i++) data[i] = 0.5;
  return {
    sampleRate: 1000,
    duration: 1,
    length: data.length,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

const ctx: DecodeCtx = { decodeAudioData: vi.fn(async () => fakeBuffer()) };

function stubFetch(notFound: string[] = []) {
  const f = vi.fn(async (url: string) => {
    if (notFound.some((n) => url.endsWith(n)))
      return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => null };
    if (url.endsWith('manifest.json'))
      return { ok: true, status: 200, json: async () => MANIFEST, arrayBuffer: async () => null };
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
  });
  vi.stubGlobal('fetch', f);
  return f;
}

describe('SampleBank', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('passa por loading → ready e emite cada mudança', async () => {
    stubFetch();
    const bank = new SampleBank('/');
    const seen: string[] = [];
    bank.on('status', ({ id, status }) => seen.push(`${id}:${status}`));
    expect(bank.status('violin')).toBe('idle');
    const p = bank.load(ctx, 'violin');
    expect(bank.status('violin')).toBe('loading');
    await p;
    expect(bank.status('violin')).toBe('ready');
    expect(seen).toEqual(['violin:loading', 'violin:ready']);
    const e = bank.get('violin')!;
    expect(e.notes).toEqual([69, 72, 76]);
    expect(e.buffers.size).toBe(3);
    expect(e.gain).toBe(0.8);
    expect(e.offsets.get(69)).toBeCloseTo(0.01);
  });

  it('é idempotente: dois load seguidos fazem um só fetch por nota', async () => {
    const f = stubFetch();
    const bank = new SampleBank('/');
    await Promise.all([bank.load(ctx, 'violin'), bank.load(ctx, 'violin')]);
    await bank.load(ctx, 'violin');
    const urls = f.mock.calls.map((c) => c[0]);
    expect(urls.filter((u) => u.endsWith('manifest.json'))).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith('.mp3'))).toHaveLength(3);
    expect(urls).toContain('/samples/violin/A4.mp3');
  });

  it('loading → error num 404, sem rejeitar; um novo load volta a tentar', async () => {
    stubFetch(['C5.mp3']);
    const bank = new SampleBank('/');
    await expect(bank.load(ctx, 'violin')).resolves.toBeUndefined();
    expect(bank.status('violin')).toBe('error');
    expect(bank.get('violin')).toBeNull();
    expect(console.warn).toHaveBeenCalled();
    expect(String(vi.mocked(console.warn).mock.calls[0][0])).toContain('[amostras]');

    stubFetch();
    await bank.load(ctx, 'violin');
    expect(bank.status('violin')).toBe('ready');
  });

  it('manifest em falta dá error e pode voltar a tentar', async () => {
    stubFetch(['manifest.json']);
    const bank = new SampleBank('/');
    await bank.load(ctx, 'violin');
    expect(bank.status('violin')).toBe('error');
    const f = stubFetch();
    await bank.load(ctx, 'violin');
    expect(bank.status('violin')).toBe('ready');
    expect(f.mock.calls.some((c) => c[0].endsWith('manifest.json'))).toBe(true);
  });

  it('instrumento fora do manifest dá error', async () => {
    stubFetch();
    const bank = new SampleBank('/');
    await bank.load(ctx, 'tuba-inexistente');
    expect(bank.status('tuba-inexistente')).toBe('error');
  });

  it('fetch que rejeita (sem rede) dá error sem lançar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const bank = new SampleBank('/');
    await expect(bank.load(ctx, 'violin')).resolves.toBeUndefined();
    expect(bank.status('violin')).toBe('error');
  });
});

describe('leadingSilence', () => {
  it('encontra a primeira amostra acima de 1e-3', () => {
    const d = new Float32Array(100);
    d[25] = 0.01;
    expect(leadingSilence(d, 1000)).toBeCloseTo(0.025);
  });
  it('só procura nos primeiros 100 ms; sem som aí, começa do início', () => {
    const d = new Float32Array(1000);
    d[500] = 0.5;
    expect(leadingSilence(d, 1000)).toBe(0);
  });
  it('som logo no início dá 0', () => {
    expect(leadingSilence(new Float32Array([0.2, 0.3]), 1000)).toBe(0);
  });
});
