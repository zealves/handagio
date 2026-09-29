import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leadingSilence, LOAD_TIMEOUT_MS, MAX_LOADED, SampleBank, type DecodeCtx } from './loader';

const MANIFEST = {
  version: 1,
  instruments: {
    violin: { source: 'violin', origin: 'x', notes: { A4: 3, C5: 3, E5: 3 }, gain: 0.8 },
    ...Object.fromEntries(
      ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8'].map((id) => [
        id,
        { source: id, origin: 'x', notes: { C4: 3 }, gain: 1 },
      ]),
    ),
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

describe('SampleBank: memória (LRU de 6 instrumentos)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('guarda no máximo 6; ao carregar o sétimo liberta o usado há mais tempo (volta a idle)', async () => {
    stubFetch();
    const bank = new SampleBank('/');
    const seen: string[] = [];
    bank.on('status', ({ id, status }) => seen.push(`${id}:${status}`));
    for (const id of ['i1', 'i2', 'i3', 'i4', 'i5', 'i6']) await bank.load(ctx, id);
    expect(bank.loaded()).toHaveLength(MAX_LOADED);
    await bank.load(ctx, 'i7');
    expect(bank.loaded()).toEqual(['i2', 'i3', 'i4', 'i5', 'i6', 'i7']);
    expect(bank.status('i1')).toBe('idle');
    expect(bank.get('i1')).toBeNull();
    expect(seen).toContain('i1:idle');
  });

  it('tocar (get) ou voltar a escolher (load) conta como uso recente', async () => {
    stubFetch();
    const bank = new SampleBank('/');
    for (const id of ['i1', 'i2', 'i3', 'i4', 'i5', 'i6']) await bank.load(ctx, id);
    bank.get('i1');
    await bank.load(ctx, 'i2');
    await bank.load(ctx, 'i7');
    expect(bank.status('i1')).toBe('ready');
    expect(bank.status('i2')).toBe('ready');
    expect(bank.status('i3')).toBe('idle');
  });

  it('nunca liberta o instrumento escolhido, mesmo sendo o usado há mais tempo', async () => {
    stubFetch();
    const bank = new SampleBank('/');
    bank.setCurrent('i1');
    for (const id of ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8']) await bank.load(ctx, id);
    expect(bank.status('i1')).toBe('ready');
    expect(bank.status('i2')).toBe('idle');
    expect(bank.status('i3')).toBe('idle');
    expect(bank.loaded()).toHaveLength(MAX_LOADED);
  });

  it('um instrumento libertado volta a carregar quando é preciso', async () => {
    const f = stubFetch();
    const bank = new SampleBank('/');
    for (const id of ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7']) await bank.load(ctx, id);
    expect(bank.status('i1')).toBe('idle');
    await bank.load(ctx, 'i1');
    expect(bank.status('i1')).toBe('ready');
    expect(f.mock.calls.filter((c) => c[0] === '/samples/i1/C4.mp3')).toHaveLength(2);
    expect(bank.status('i2')).toBe('idle');
  });
});

describe('SampleBank: tempo limite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetch que nunca responde: error aos 20 s; um novo load volta a tentar', async () => {
    const hang = vi.fn((_url: string, _init?: RequestInit) => new Promise<never>(() => {}));
    vi.stubGlobal('fetch', hang);
    const bank = new SampleBank('/');
    const p = bank.load(ctx, 'violin');
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS - 1);
    expect(bank.status('violin')).toBe('loading');
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(bank.status('violin')).toBe('error');

    stubFetch();
    await bank.load(ctx, 'violin');
    expect(bank.status('violin')).toBe('ready');
  });

  it('notas penduradas: os pedidos são cancelados (AbortSignal) e o estado passa a error', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('manifest.json'))
          return { ok: true, status: 200, json: async () => MANIFEST };
        signals.push(init!.signal!);
        return new Promise<never>(() => {});
      }),
    );
    const bank = new SampleBank('/');
    const p = bank.load(ctx, 'violin');
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    await p;
    expect(bank.status('violin')).toBe('error');
    expect(signals).toHaveLength(3);
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('SampleBank: tentar de novo quando a rede volta', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const offline = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

  it('no evento online volta a carregar só o instrumento escolhido em error', async () => {
    offline();
    const bank = new SampleBank('/');
    const net = new EventTarget();
    const off = bank.retryOnOnline(net, () => ctx);
    bank.setCurrent('violin');
    await bank.load(ctx, 'violin');
    await bank.load(ctx, 'i1');
    expect(bank.status('violin')).toBe('error');
    expect(bank.status('i1')).toBe('error');

    const f = stubFetch();
    net.dispatchEvent(new Event('online'));
    expect(bank.status('violin')).toBe('loading');
    await vi.waitFor(() => expect(bank.status('violin')).toBe('ready'));
    expect(bank.status('i1')).toBe('error');
    expect(f.mock.calls.some((c) => c[0].includes('/i1/'))).toBe(false);

    // depois da limpeza já não reage
    off();
    offline();
    bank.setCurrent('i1');
    net.dispatchEvent(new Event('online'));
    expect(bank.status('i1')).toBe('error');
  });

  it('sem AudioContext (ainda sem gesto) não faz nada', async () => {
    offline();
    const bank = new SampleBank('/');
    const net = new EventTarget();
    bank.retryOnOnline(net, () => null);
    bank.setCurrent('violin');
    await bank.load(ctx, 'violin');
    net.dispatchEvent(new Event('online'));
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
