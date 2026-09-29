# Redesenho da interface v2 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o layout de três colunas com separadores por um palco em primeiro plano, com uma barra de controlo e gavetas. A lógica de som, visão, looper e gravação fica igual.

**Architecture:** A camada nova vive em `src/ui/shell/`: lógica pura testada em `logic.ts`, componentes `ControlBar`, `Drawer`, `DrawerHost`, `MoreMenu`, `InstrumentPicker`, `WaveViz` e `EffectsDrawer`, o registo de efeitos `effects.tsx` e os atalhos. Os painéis existentes (`ScalePanel`, `TempoPanel`, `LooperPanel`, `RecordPanel`) passam para dentro das gavetas. O `Panel` fica "plano" quando está dentro de uma gaveta. O store perde `view` e `showVideo` e ganha `stageBg`, `showWaves`, `recentInstruments`, `drawer` e `uiHidden`, com migração do `persist` para a versão 2.

**Tech Stack:** Vite + React 18 + TypeScript estrito, Zustand (`persist`), CSS Modules, container queries (`cqw`/`cqh`), `<dialog>` nativo, Vitest (node) e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-ui-redesign-v2-design.md`

## Global Constraints

- Interface em português de Portugal (textos, `aria-label`, comentários).
- `src/vision` e `src/audio` não importam React.
- Valores a 60 fps nunca vão para estado React: usar `live` e canvas (ou refs com `useFrame`).
- Sem `alert`/`confirm`; diálogos com `<dialog>`.
- Antes de cada commit: `npm run build && npm run lint && npm test` (o lint não aceita avisos).
- Commits em inglês, Conventional Commits, assunto no imperativo e em minúsculas, sem ponto final, até ~72 caracteres. Autor único, sem `Co-Authored-By`.
- Trabalho no ramo `redesign/v2`. Nunca fazer push para `main` sem o utilizador pedir, porque isso faz deploy.
- Atalhos novos: `I` (esconder interface), `E` (ecrã inteiro), `,` e `.` (instrumento anterior e seguinte), Esc. `H` e `F` estão ocupadas pelas notas.
- Sem scroll horizontal em nenhuma largura ≥ 320 px.
- Meta de desempenho: no máximo 3 canvases desenhados por fotograma com a UI por defeito (overlay, partículas, faixa de ondas).

## Review Focus

1. **iOS Safari sem Fullscreen API:** carregar em ⛶ ou premir `E` tem de esconder a interface em vez de falhar em silêncio ou lançar erro (teste na Task 11).
2. **Preferências antigas da v1 no `localStorage`:** com `showVideo: false` e sem os campos novos, a v2 tem de abrir com o fundo "Só mãos" e sem erro (unitário na Task 1, e2e na Task 11).
3. **Recentes com ids que já não existem** (um som removido numa versão futura): o seletor tem de os ignorar sem rebentar (unitário na Task 1).
4. **Escrever na pesquisa de instrumentos** (letras de notas, `i`, `e`, `,`, `.`): não pode tocar notas nem disparar atalhos (unitário na Task 7, e2e na Task 11).
5. **Gravar vídeo com o fundo "Só mãos":** o ficheiro não pode incluir a imagem da câmara (unitário de `compositeSources` na Task 1, ligado na Task 4).

---

### Task 1: Lógica pura do shell

**Files:**
- Create: `src/ui/shell/logic.ts`
- Test: `src/ui/shell/logic.test.ts`
- Modify: `src/state/types.ts` (tipos `StageBg`, `DrawerId`)

**Interfaces:**
- Produces:
  - `type StageBg = 'camara' | 'maos' | 'ondas'`, `type DrawerId = 'instrumentos' | 'escala' | 'efeitos' | 'tempo' | 'gravacoes' | 'rato'` (em `state/types.ts`)
  - `pushRecent(list: string[], id: string, max?: number): string[]`
  - `normalize(s: string): string`
  - `filterByFamily(filter: string, list?: InstrumentInfo[]): InstrumentInfo[]`
  - `searchInstruments(query: string, list?: InstrumentInfo[]): InstrumentInfo[]`
  - `groupByFamily(list: InstrumentInfo[]): { family: Family; items: InstrumentInfo[] }[]`
  - `recentInfos(ids: string[]): InstrumentInfo[]`
  - `nextInstrument(id: string, dir: 1 | -1, filter?: string): string`
  - `STAGE_BGS: StageBg[]`, `STAGE_BG_LABEL: Record<StageBg, string>`, `nextStageBg(bg: StageBg): StageBg`
  - `DRAWER_IDS: DrawerId[]`, `DRAWER_TITLES: Record<DrawerId, string>`
  - `migratePrefs(old: unknown, version: number): Record<string, unknown>`
  - `compositeSources<V, C>(bg: StageBg, video: V | null, c: { waves: C | null; particles: C | null; overlay: C | null }): { video: V | null; layers: (C | null)[] }`

- [ ] **Step 1: Acrescentar os tipos em `src/state/types.ts`** (a seguir a `View`, que só sai na Task 10)

```ts
export type StageBg = 'camara' | 'maos' | 'ondas';
export type DrawerId = 'instrumentos' | 'escala' | 'efeitos' | 'tempo' | 'gravacoes' | 'rato';
```

- [ ] **Step 2: Escrever os testes que falham** em `src/ui/shell/logic.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { INSTRUMENTS } from '../../audio/instruments';
import {
  compositeSources,
  groupByFamily,
  migratePrefs,
  nextInstrument,
  nextStageBg,
  normalize,
  pushRecent,
  recentInfos,
  searchInstruments,
} from './logic';

describe('pushRecent', () => {
  it('põe no início, sem duplicados, até ao máximo', () => {
    expect(pushRecent([], 'piano')).toEqual(['piano']);
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
  it('não altera a lista original', () => {
    const l = ['a'];
    pushRecent(l, 'b');
    expect(l).toEqual(['a']);
  });
});

describe('pesquisa', () => {
  it('normaliza acentos e maiúsculas', () => {
    expect(normalize('  Órgão ')).toBe('orgao');
  });
  it('encontra pelo nome sem acentos', () => {
    const r = searchInstruments('orgao');
    expect(r.map((i) => i.id)).toContain('organ');
  });
  it('encontra pela família', () => {
    const r = searchInstruments('percussao');
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r.every((i) => i.family === 'Percussão')).toBe(true);
  });
  it('todas as palavras têm de aparecer', () => {
    expect(searchInstruments('piano zzzz')).toEqual([]);
  });
  it('pesquisa vazia devolve a lista', () => {
    expect(searchInstruments('   ')).toHaveLength(INSTRUMENTS.length);
  });
});

describe('groupByFamily', () => {
  it('agrupa pela ordem de FAMILIES e omite grupos vazios', () => {
    const g = groupByFamily(INSTRUMENTS);
    expect(g[0].family).toBe('Teclas');
    expect(g.reduce((n, x) => n + x.items.length, 0)).toBe(INSTRUMENTS.length);
    expect(groupByFamily(searchInstruments('marimba')).map((x) => x.family)).toEqual(['Lâminas']);
  });
});

describe('recentInfos', () => {
  it('ignora ids desconhecidos', () => {
    expect(recentInfos(['piano', 'nao-existe', 'marimba']).map((i) => i.id)).toEqual([
      'piano',
      'marimba',
    ]);
  });
});

describe('nextInstrument', () => {
  const first = INSTRUMENTS[0].id;
  const last = INSTRUMENTS[INSTRUMENTS.length - 1].id;
  it('avança e dá a volta', () => {
    expect(nextInstrument(INSTRUMENTS[0].id, 1)).toBe(INSTRUMENTS[1].id);
    expect(nextInstrument(last, 1)).toBe(first);
    expect(nextInstrument(first, -1)).toBe(last);
  });
  it('respeita o filtro de família', () => {
    const drums = INSTRUMENTS.filter((i) => i.family === 'Percussão');
    expect(nextInstrument(drums[drums.length - 1].id, 1, 'Percussão')).toBe(drums[0].id);
    // instrumento atual fora do filtro: vai para o primeiro do filtro
    expect(nextInstrument('piano', 1, 'Percussão')).toBe(drums[0].id);
  });
});

describe('nextStageBg', () => {
  it('roda câmara → mãos → ondas → câmara', () => {
    expect(nextStageBg('camara')).toBe('maos');
    expect(nextStageBg('maos')).toBe('ondas');
    expect(nextStageBg('ondas')).toBe('camara');
  });
});

describe('migratePrefs', () => {
  it('v1 com showVideo false passa a só mãos', () => {
    const m = migratePrefs({ showVideo: false, bpm: 90 }, 1);
    expect(m).toEqual({ stageBg: 'maos', bpm: 90 });
  });
  it('v1 com showVideo true (ou ausente) passa a câmara', () => {
    expect(migratePrefs({ showVideo: true }, 1)).toEqual({ stageBg: 'camara' });
    expect(migratePrefs({}, 1)).toEqual({ stageBg: 'camara' });
  });
  it('estado nulo não rebenta', () => {
    expect(migratePrefs(null, 1)).toEqual({ stageBg: 'camara' });
  });
  it('v2 fica igual', () => {
    expect(migratePrefs({ stageBg: 'ondas' }, 2)).toEqual({ stageBg: 'ondas' });
  });
});

describe('compositeSources', () => {
  const c = { waves: 'W', particles: 'P', overlay: 'O' };
  it('câmara: vídeo e camadas sem ondas', () => {
    expect(compositeSources('camara', 'V', c)).toEqual({ video: 'V', layers: ['P', 'O'] });
  });
  it('só mãos: nunca passa o vídeo', () => {
    expect(compositeSources('maos', 'V', c)).toEqual({ video: null, layers: ['P', 'O'] });
  });
  it('ondas: sem vídeo, ondas por baixo', () => {
    expect(compositeSources('ondas', 'V', c)).toEqual({ video: null, layers: ['W', 'P', 'O'] });
  });
});
```

- [ ] **Step 3: Correr e ver falhar**

Run: `npx vitest run src/ui/shell/logic.test.ts`
Expected: FAIL (`Failed to resolve import "./logic"`)

- [ ] **Step 4: Implementar `src/ui/shell/logic.ts`**

```ts
// Lógica pura do shell da interface (sem React nem DOM): pesquisa, recentes, rotação de
// instrumentos e fundos, migração das preferências e fontes da composição de vídeo.
import { INSTRUMENT_BY_ID, INSTRUMENTS, type InstrumentInfo } from '../../audio/instruments';
import { FAMILIES, type Family } from '../../audio/patches/types';
import type { DrawerId, StageBg } from '../../state/types';

export function pushRecent(list: string[], id: string, max = 6): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

export const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const filterByFamily = (
  filter: string,
  list: InstrumentInfo[] = INSTRUMENTS,
): InstrumentInfo[] => (filter === 'Todos' ? list : list.filter((i) => i.family === filter));

export function searchInstruments(
  query: string,
  list: InstrumentInfo[] = INSTRUMENTS,
): InstrumentInfo[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return list;
  return list.filter((i) => {
    const hay = normalize(`${i.name} ${i.family} ${i.desc}`);
    return terms.every((t) => hay.includes(t));
  });
}

export function groupByFamily(
  list: InstrumentInfo[],
): { family: Family; items: InstrumentInfo[] }[] {
  return FAMILIES.map((family) => ({ family, items: list.filter((i) => i.family === family) })).filter(
    (g) => g.items.length > 0,
  );
}

export const recentInfos = (ids: string[]): InstrumentInfo[] =>
  ids.map((id) => INSTRUMENT_BY_ID[id]).filter((i): i is InstrumentInfo => !!i);

export function nextInstrument(id: string, dir: 1 | -1, filter = 'Todos'): string {
  const list = filterByFamily(filter);
  if (!list.length) return id;
  const k = list.findIndex((i) => i.id === id);
  if (k < 0) return list[dir > 0 ? 0 : list.length - 1].id;
  return list[(k + dir + list.length) % list.length].id;
}

export const STAGE_BGS: StageBg[] = ['camara', 'maos', 'ondas'];
export const STAGE_BG_LABEL: Record<StageBg, string> = {
  camara: 'Câmara',
  maos: 'Só mãos',
  ondas: 'Ondas',
};
export const nextStageBg = (bg: StageBg): StageBg =>
  STAGE_BGS[(STAGE_BGS.indexOf(bg) + 1) % STAGE_BGS.length];

export const DRAWER_IDS: DrawerId[] = [
  'instrumentos',
  'escala',
  'efeitos',
  'tempo',
  'gravacoes',
  'rato',
];
export const DRAWER_TITLES: Record<DrawerId, string> = {
  instrumentos: 'Instrumentos',
  escala: 'Escala e acordes',
  efeitos: 'Efeitos',
  tempo: 'Tempo e looper',
  gravacoes: 'Gravações',
  rato: 'Tocar com o rato',
};

/** Migração do `persist`: v1 tinha `showVideo`; a v2 usa `stageBg`. */
export function migratePrefs(old: unknown, version: number): Record<string, unknown> {
  const o: Record<string, unknown> = { ...((old as Record<string, unknown> | null) ?? {}) };
  if (version < 2) {
    o.stageBg = o.showVideo === false ? 'maos' : 'camara';
    delete o.showVideo;
  }
  return o;
}

/** O que entra no vídeo gravado: segue o fundo do palco (a pessoa só aparece com `camara`). */
export function compositeSources<V, C>(
  bg: StageBg,
  video: V | null,
  c: { waves: C | null; particles: C | null; overlay: C | null },
): { video: V | null; layers: (C | null)[] } {
  return {
    video: bg === 'camara' ? video : null,
    layers: bg === 'ondas' ? [c.waves, c.particles, c.overlay] : [c.particles, c.overlay],
  };
}
```

- [ ] **Step 5: Correr e ver passar**

Run: `npx vitest run src/ui/shell/logic.test.ts`
Expected: PASS (todos). Se `searchInstruments('orgao')` não devolver `organ`, confirmar o nome do patch em `src/audio/patches/keys.ts` e ajustar o termo do teste ao nome real (sem mudar a função).

- [ ] **Step 6: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test
git add src/state/types.ts src/ui/shell/logic.ts src/ui/shell/logic.test.ts
git commit -m "feat: add pure shell logic for search, recents and stage backgrounds"
```

---

### Task 2: Estado novo no store e recentes

**Files:**
- Modify: `src/state/store.ts`
- Create: `src/ui/shell/recents.ts`

**Interfaces:**
- Consumes: `StageBg`, `DrawerId` (Task 1), `pushRecent` (Task 1)
- Produces:
  - Prefs: `stageBg: StageBg` (defeito `'camara'`), `showWaves: boolean` (`true`), `recentInstruments: string[]` (`[]`)
  - Runtime: `drawer: DrawerId | null` (`null`), `uiHidden: boolean` (`false`)
  - `installRecents(): () => void`

`showVideo` e `view` **ainda ficam**: saem nas Tasks 4 e 10, para que o build continue a passar em cada commit.

- [ ] **Step 1: Editar `src/state/store.ts`**

No import dos tipos, acrescentar `DrawerId, StageBg`:

```ts
import type {
  Calibration,
  DrawerId,
  Engine,
  LoopBars,
  MouthFxId,
  Quantize,
  StageBg,
  ThemeName,
  View,
} from './types';
```

Em `Prefs`, a seguir a `showVideo: boolean;`:

```ts
  stageBg: StageBg;
  showWaves: boolean;
  recentInstruments: string[];
```

Em `Runtime`, a seguir a `settingsOpen: boolean;`:

```ts
  drawer: DrawerId | null;
  uiHidden: boolean;
```

Em `DEFAULT_PREFS`, a seguir a `showVideo: true,`:

```ts
  stageBg: 'camara',
  showWaves: true,
  recentInstruments: [],
```

No estado inicial do `create`, a seguir a `settingsOpen: false,`:

```ts
      drawer: null,
      uiHidden: false,
```

- [ ] **Step 2: Criar `src/ui/shell/recents.ts`**

```ts
// Mantém `recentInstruments` atualizado sempre que o instrumento muda (UI, preset ou atalho).
import { useStore } from '../../state/store';
import { pushRecent } from './logic';

export function installRecents(): () => void {
  const s = useStore.getState();
  if (s.recentInstruments[0] !== s.instrument)
    s.set({ recentInstruments: pushRecent(s.recentInstruments, s.instrument) });
  return useStore.subscribe((st, prev) => {
    if (st.instrument !== prev.instrument)
      st.set({ recentInstruments: pushRecent(st.recentInstruments, st.instrument) });
  });
}
```

Fica por ligar em `App.tsx` na Task 10.

- [ ] **Step 3: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test
git add src/state/store.ts src/ui/shell/recents.ts
git commit -m "feat: add stage background, drawer and recents state"
```

---

### Task 3: `useCanvas` só desenha o que está à vista, estatísticas do rAF e `WaveViz`

**Files:**
- Modify: `src/ui/frame.ts`
- Modify: `src/ui/panels/draw.ts` (acrescentar `drawWaves`)
- Modify: `src/ui/panels/VisualizerPanel.tsx` (usar `drawWaves`; o ficheiro sai na Task 10)
- Modify: `src/state/stageCanvases.ts`
- Modify: `src/ui/stage/ParticleWave.tsx` (`{ always: true }`)
- Create: `src/lib/debug.ts`
- Modify: `src/main.tsx`
- Create: `src/ui/shell/WaveViz.tsx`

**Interfaces:**
- Produces:
  - `useCanvas(draw: DrawFn, opts?: { always?: boolean })`: com `always`, desenha mesmo fora do ecrã. Serve aos canvases do palco, que a gravação compõe.
  - `frameStats: { fps: number; ms: number }` (em `frame.ts`): FPS do rAF partilhado e tempo médio de um fotograma dos subscritores, atualizados a cada segundo.
  - `DEBUG: boolean` (em `src/lib/debug.ts`)
  - `drawWaves(g, w, h, now, hist: Float32Array[]): void` (em `draw.ts`)
  - `stageCanvases.waves: HTMLCanvasElement | null`
  - `<WaveViz className?: string; register?: boolean />`: com `register`, regista-se em `stageCanvases.waves` e desenha sempre.

- [ ] **Step 1: `src/lib/debug.ts`**

```ts
// Diagnóstico ligado em desenvolvimento ou com ?debug no endereço.
export const DEBUG =
  import.meta.env.DEV || new URLSearchParams(globalThis.location?.search ?? '').has('debug');
```

Em `src/main.tsx`, substituir a condição `import.meta.env.DEV || new URLSearchParams(location.search).has('debug')` por `DEBUG`, importado de `./lib/debug`.

- [ ] **Step 2: `src/ui/frame.ts`: estatísticas e visibilidade**

Substituir `loop` por:

```ts
/** FPS do rAF partilhado e tempo médio (ms) gasto pelos subscritores por fotograma. */
export const frameStats = { fps: 0, ms: 0 };
let statT = 0;
let statN = 0;
let statMs = 0;

function loop(now: number) {
  raf = subs.size ? requestAnimationFrame(loop) : 0;
  const dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  const t0 = performance.now();
  subs.forEach((fn) => fn(now, dt));
  statMs += performance.now() - t0;
  statN++;
  if (now - statT >= 1000) {
    frameStats.fps = statN;
    frameStats.ms = +(statMs / Math.max(1, statN)).toFixed(2);
    statT = now;
    statN = 0;
    statMs = 0;
  }
}
```

Mudar a assinatura e o corpo de `useCanvas`:

```ts
/**
 * Canvas com resolução ajustada ao ecrã (devicePixelRatio) e desenho a cada fotograma.
 * `w`/`h` chegam em píxeis CSS; o contexto já está escalado. Não desenha quando está fora do
 * ecrã ou tem tamanho 0, a não ser com `always` (canvases do palco, que a gravação compõe).
 */
export function useCanvas(draw: DrawFn, opts: { always?: boolean } = {}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const visible = useRef(true);
  const always = !!opts.always;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ro = new ResizeObserver(() => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: r.width, h: r.height, dpr };
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
    });
    ro.observe(cv);
    let io: IntersectionObserver | undefined;
    if (!always && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([e]) => {
        visible.current = e.isIntersecting;
      });
      io.observe(cv);
    }
    return () => {
      ro.disconnect();
      io?.disconnect();
    };
  }, [always]);
  useFrame((now, dt) => {
    const cv = ref.current;
    const { w, h, dpr } = size.current;
    if (!cv || !w || !h || !visible.current) return;
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(g, w, h, now, dt);
  });
  return ref;
}
```

Em `src/ui/stage/ParticleWave.tsx`, passar `{ always: true }` como segundo argumento de `useCanvas(...)`.

- [ ] **Step 3: `drawWaves` em `src/ui/panels/draw.ts`**

Acrescentar no fim do ficheiro (o código é o do "Analisador dinâmico" do `VisualizerPanel`, sem mudanças de comportamento). Importar `NEON` de `'../theme'`, se ainda não estiver importado.

```ts
/** Várias linhas de onda sobrepostas, cada uma com escala e fase próprias (analisador dinâmico). */
export function drawWaves(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
  hist: Float32Array[],
): void {
  g.clearRect(0, 0, w, h);
  const N = 96;
  const cur = new Float32Array(N);
  if (audio.ready) {
    const wf = audio.analyser.waveform();
    const step = Math.floor(wf.length / N);
    for (let i = 0; i < N; i++) cur[i] = wf[i * step];
  }
  hist.unshift(cur);
  if (hist.length > 4) hist.pop();
  const colors = [NEON.cyan, NEON.violet, NEON.magenta, NEON.blue];
  g.lineWidth = 1.6;
  g.shadowBlur = 6;
  hist.forEach((line, k) => {
    g.strokeStyle = colors[k];
    g.shadowColor = colors[k];
    g.globalAlpha = 1 - k * 0.2;
    g.beginPath();
    for (let i = 0; i < N; i++) {
      const idle = Math.sin(now / 500 + i * 0.18 + k) * 0.05;
      const v = line[i] * (2.2 - k * 0.35) + idle;
      const x = (i / (N - 1)) * w;
      const y =
        h / 2 + v * h * 0.45 + Math.sin(i * 0.12 + k * 1.3 + now / 900) * h * 0.08 * (k + 1) * 0.4;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
  });
  g.globalAlpha = 1;
  g.shadowBlur = 0;
}
```

Em `VisualizerPanel.tsx`, substituir o corpo do `multi` por `const multi = useCanvas((g, w, h, now) => drawWaves(g, w, h, now, hist.current));` e importar `drawWaves`. Remover o import de `NEON` se deixar de ser usado.

- [ ] **Step 4: `stageCanvases.waves`**

`src/state/stageCanvases.ts`:

```ts
// Registo dos canvas do palco, para o compositor de vídeo da gravação os poder desenhar.
export const stageCanvases: {
  waves: HTMLCanvasElement | null;
  particles: HTMLCanvasElement | null;
  overlay: HTMLCanvasElement | null;
} = {
  waves: null,
  particles: null,
  overlay: null,
};
```

- [ ] **Step 5: `src/ui/shell/WaveViz.tsx`**

```tsx
// O visualizador único da app: ondas sobrepostas. Na faixa por baixo do palco ou, com o fundo
// "Ondas", em grande dentro do palco (aí regista-se para entrar na gravação).
import { useEffect, useRef } from 'react';
import { stageCanvases } from '../../state/stageCanvases';
import { useCanvas } from '../frame';
import { drawWaves } from '../panels/draw';

interface Props {
  className?: string;
  register?: boolean;
}

export function WaveViz({ className, register = false }: Props) {
  const hist = useRef<Float32Array[]>([]);
  const ref = useCanvas((g, w, h, now) => drawWaves(g, w, h, now, hist.current), {
    always: register,
  });
  useEffect(() => {
    if (!register) return;
    const cv = ref.current;
    stageCanvases.waves = cv;
    return () => {
      if (stageCanvases.waves === cv) stageCanvases.waves = null;
    };
  }, [register, ref]);
  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden
      data-testid={register ? 'stage-waves' : 'waves'}
    />
  );
}
```

- [ ] **Step 6: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test
git add src/lib/debug.ts src/main.tsx src/ui/frame.ts src/ui/panels/draw.ts src/ui/panels/VisualizerPanel.tsx src/state/stageCanvases.ts src/ui/stage/ParticleWave.tsx src/ui/shell/WaveViz.tsx
git commit -m "perf: skip offscreen canvases and extract the wave visualizer"
```

---

### Task 4: Fundo do palco (substitui `showVideo`) e gravação coerente

**Files:**
- Modify: `src/ui/stage/CameraStage.tsx`, `src/ui/stage/CameraStage.module.css`
- Modify: `src/ui/stage/HandOverlay.tsx` (atributo `data-layer`)
- Modify: `src/app/recording.ts`
- Modify: `src/state/store.ts` (remover `showVideo`, `persist` versão 2)
- Modify: `src/ui/panels/SettingsDialog.tsx` (remover o toggle)
- Modify: `scripts/make-demo-gif.mjs`
- Modify: `docs/superpowers/specs/2026-09-29-ui-redesign-v2-design.md` (nota sobre `opacity`)

**Interfaces:**
- Consumes: `stageBg` (Task 2), `migratePrefs` e `compositeSources` (Task 1), `WaveViz` (Task 3)

**Nota:** o `<video>` fica escondido com `opacity: 0` (como o `showVideo` da v1) e não com `display: none`. No iOS Safari, um vídeo com `display: none` pode deixar de entregar fotogramas ao MediaPipe. A `opacity` já está provada na v1. A spec atualiza-se no Step 6.

- [ ] **Step 1: `CameraStage.tsx`**

Substituir `const showVideo = useStore((st) => st.showVideo);` por `const bg = useStore((st) => st.stageBg);`. Remover todo o `<div className={s.titlebar}>…</div>` e o import de `IconLogo`. No `<div className={s.stage}>`, acrescentar `data-bg={bg}`. O `<video>` passa a ter `style={{ opacity: bg === 'camara' ? 1 : 0 }}`. Logo a seguir a `<div className={s.dim} aria-hidden />`, inserir `{bg === 'ondas' && <WaveViz className={s.bgWaves} register />}`, com `import { WaveViz } from '../shell/WaveViz';`.

O `style` do `.stage` com `aspectRatio`/`--ar` fica por agora; muda na Task 10.

- [ ] **Step 2: `HandOverlay.tsx`**

`return <canvas ref={ref} aria-hidden data-testid="overlay" data-layer="hands" />;`

- [ ] **Step 3: `CameraStage.module.css`**

Remover as regras `.titlebar`, `.dots`, `.dots i` e os dois blocos `:global([data-view=…]) .stage`, e dentro do `@media (max-width: 600px)` remover `.titlebar { display: none; }`. Acrescentar:

```css
/* Fundo "Ondas": o visualizador ocupa o palco e as mãos ficam mais discretas. */
.bgWaves {
  opacity: 0.9;
}
.stage[data-bg='ondas'] [data-layer='hands'] {
  opacity: 0.6;
}
.stage:not([data-bg='camara']) .dim {
  background: radial-gradient(ellipse at center, rgba(20, 30, 70, 0.35), rgba(6, 10, 22, 0.85));
}
```

- [ ] **Step 4: `src/app/recording.ts`**

Importar `compositeSources` de `'../ui/shell/logic'`. Dentro de `recorder.start(withVideo ? { … } : undefined)`, substituir as linhas `video: v,` e `layers: () => [stageCanvases.particles, stageCanvases.overlay],` por getters que seguem o fundo em tempo real:

```ts
        ? {
            get video() {
              return compositeSources(getState().stageBg, v, stageCanvases).video;
            },
            width: live.videoW,
            height: live.videoH,
            layers: () => compositeSources(getState().stageBg, v, stageCanvases).layers,
```

(o `hud` fica como está).

- [ ] **Step 5: Remover `showVideo` e migrar**

Em `src/state/store.ts`: remover `showVideo: boolean;` de `Prefs` e `showVideo: true,` de `DEFAULT_PREFS`. Importar `migratePrefs` de `'../ui/shell/logic'`. No objeto do `persist`:

```ts
    {
      name: 'vision-sound-cam:prefs',
      version: 2,
      migrate: (old, version) => migratePrefs(old, version) as unknown as Store,
      partialize: (s) => Object.fromEntries(PREF_KEYS.map((k) => [k, s[k]])) as Partial<Store>,
    },
```

Em `SettingsDialog.tsx`: remover `showVideo: x.showVideo,` do seletor e o `<Toggle label="Mostrar a imagem da câmara" …/>`.

Em `scripts/make-demo-gif.mjs`, linha 41: `showVideo: false` → `stageBg: 'maos'`.

Run: `grep -rn showVideo src scripts e2e`
Expected: sem resultados.

- [ ] **Step 6: Atualizar a spec**

Na tabela "Fundo do palco" da spec, trocar ``; `<video>` com `display:none` `` por ``; `<video>` com `opacity: 0` (não `display:none`: no iOS o vídeo escondido deixa de entregar fotogramas) ``.

- [ ] **Step 7: Verificar no browser**

Run: `npm run dev`, abrir `http://localhost:5173/?debug` e ligar a câmara. Na consola:
`__vsc.store.getState().set({ stageBg: 'maos' })` deixa o vídeo invisível e as mãos neon continuam; `'ondas'` mostra as ondas em grande. Nesta fase o layout antigo ainda existe.

- [ ] **Step 8: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test
git add -A src scripts docs/superpowers/specs
git commit -m "feat: add stage background modes and keep recordings consistent"
```

---

### Task 5: Registo de efeitos, knob pequeno e gaveta de efeitos

**Files:**
- Modify: `src/ui/controls/Knob.tsx`, `src/ui/controls/Knob.module.css`
- Create: `src/ui/shell/effects.tsx`
- Create: `src/ui/shell/EffectsDrawer.tsx`, `src/ui/shell/shell.module.css`

**Interfaces:**
- Produces:
  - `Knob` com a prop nova `size?: number` (defeito 64)
  - `interface EffectDef { id: string; label: string; desc: string; quick: boolean; Control: ComponentType<{ size?: number; testId?: string }> }`
  - `EFFECTS: EffectDef[]`: reverb, echo, pitch, filter, drive, mouth
  - `<EffectsDrawer />`
  - `shell.module.css`: classes partilhadas `card`, `cardHead`, `cardDesc`, `cards`

- [ ] **Step 1: `Knob` com `size`**

Em `Props`, acrescentar `size?: number;`. Na desestruturação, `size = 64,`. No JSX:

```tsx
    <div className={s.knob} style={size < 64 ? { gap: 2 } : undefined}>
      <div
        ref={ref}
        className={s.dial}
        style={{ width: size, height: size }}
        …
      >
        <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
```

(o resto do SVG não muda, porque o `viewBox` escala). Em `Knob.module.css`, o `.dial` deixa de fixar `width: 64px; height: 64px;` (o tamanho vem do `style`).

- [ ] **Step 2: `src/ui/shell/effects.tsx`**

```tsx
// Registo dos efeitos globais: cada entrada tem o seu controlo. `quick` põe-no também na barra.
// Um efeito novo = uma entrada aqui + o nó correspondente em src/audio.
import { useId, useRef, type ComponentType } from 'react';
import { live } from '../../state/live';
import { DEFAULT_SOUND, useStore, type SoundSettings } from '../../state/store';
import { MOUTH_FX, type MouthFxId } from '../../state/types';
import { Knob } from '../controls/Knob';
import { useFrame } from '../frame';
import p from '../panels/panels.module.css';

export interface EffectDef {
  id: string;
  label: string;
  desc: string;
  quick: boolean;
  Control: ComponentType<{ size?: number; testId?: string }>;
}

type KnobKey = 'reverb' | 'echo' | 'pitch' | 'filter' | 'drive';
const pct = (v: number) => `${Math.round(v * 100)}%`;
const semis = (v: number) => (v === 0 ? '0 st' : `${v > 0 ? '+' : ''}${v} st`);

function storeKnob(
  k: KnobKey,
  label: string,
  o: { min: number; max: number; step?: number; format: (v: number) => string },
) {
  function EffectKnob({ size, testId }: { size?: number; testId?: string }) {
    const value = useStore((st) => st[k]);
    const set = useStore((st) => st.set);
    return (
      <Knob
        label={label}
        value={value}
        min={o.min}
        max={o.max}
        step={o.step}
        defaultValue={(DEFAULT_SOUND as SoundSettings)[k]}
        onChange={(v) => set({ [k]: v })}
        format={o.format}
        size={size}
        testId={testId}
      />
    );
  }
  return EffectKnob;
}

function MouthControl() {
  const mouthFx = useStore((st) => st.mouthFx);
  const set = useStore((st) => st.set);
  const id = useId();
  const bar = useRef<HTMLElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    if (bar.current) bar.current.style.width = `${live.mouth * 100}%`;
    if (txt.current) {
      const face = useStore.getState().faceState;
      txt.current.textContent =
        face === 'unavailable' && !live.spaceHeld
          ? 'indisponível'
          : face === 'waiting' && !live.spaceHeld && live.mouth < 0.02
            ? 'à espera'
            : live.mouth > 0.08
              ? `${Math.round(live.mouth * 100)}%`
              : 'fechada';
    }
  });
  return (
    <div>
      <label className={p.mouthSel}>
        <select
          value={mouthFx}
          onChange={(e) => set({ mouthFx: e.target.value as MouthFxId })}
          aria-describedby={`${id}-md`}
          data-testid="mouth-fx"
        >
          {MOUTH_FX.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <span className={p.sub} style={{ margin: 0 }}>
          Efeito da boca
        </span>
      </label>
      <div className={p.meter}>
        <span>Boca</span>
        <div className={p.bar} role="presentation">
          <i ref={bar} />
        </div>
        <span ref={txt} className={p.meterTxt} aria-live="off">
          à espera
        </span>
      </div>
      <p id={`${id}-md`} className={p.desc} style={{ minHeight: 0, marginTop: 6 }}>
        {MOUTH_FX.find((m) => m.id === mouthFx)?.desc}. Segura <kbd>Espaço</kbd> para simular.
      </p>
    </div>
  );
}

export const EFFECTS: EffectDef[] = [
  {
    id: 'reverb',
    label: 'Reverb',
    desc: 'Espaço à volta do som',
    quick: true,
    Control: storeKnob('reverb', 'Reverb', { min: 0, max: 1, format: pct }),
  },
  {
    id: 'echo',
    label: 'Eco',
    desc: 'Delay: repetições do som',
    quick: true,
    Control: storeKnob('echo', 'Eco', { min: 0, max: 1, format: pct }),
  },
  {
    id: 'pitch',
    label: 'Pitch',
    desc: 'Transpõe tudo em semitons',
    quick: false,
    Control: storeKnob('pitch', 'Pitch', { min: -12, max: 12, step: 1, format: semis }),
  },
  {
    id: 'filter',
    label: 'Filtro',
    desc: 'Fecha para abafar o som',
    quick: false,
    Control: storeKnob('filter', 'Filtro', { min: 0, max: 1, format: pct }),
  },
  {
    id: 'drive',
    label: 'Drive',
    desc: 'Saturação quente',
    quick: false,
    Control: storeKnob('drive', 'Drive', { min: 0, max: 1, format: pct }),
  },
  { id: 'mouth', label: 'Boca', desc: 'Abre a boca para aplicar', quick: false, Control: MouthControl },
];
```

Se o `tsc` se queixar de `defaultValue` porque `SoundSettings[k]` não é `number`, trocar por `DEFAULT_SOUND[k] as number`. Todas as chaves de `KnobKey` são numéricas.

- [ ] **Step 3: `src/ui/shell/shell.module.css`** (partilhado pelas peças do shell)

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}
.card {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 12px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--tile-bg);
  min-width: 0;
}
.cardWide {
  grid-column: 1 / -1;
  justify-items: stretch;
}
.cardHead {
  font-family: var(--font-title);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin: 0;
}
.cardDesc {
  margin: 0;
  font-size: 11.5px;
  color: var(--muted);
  text-align: center;
}
```

- [ ] **Step 4: `src/ui/shell/EffectsDrawer.tsx`**

```tsx
import { EFFECTS } from './effects';
import s from './shell.module.css';

export function EffectsDrawer() {
  return (
    <div className={s.cards} data-testid="effects">
      {EFFECTS.map(({ id, label, desc, Control }) => (
        <section
          key={id}
          className={`${s.card} ${id === 'mouth' ? s.cardWide : ''}`}
          aria-label={label}
        >
          {id === 'mouth' && <h3 className={s.cardHead}>{label}</h3>}
          <Control testId={id === 'reverb' ? 'knob-reverb' : undefined} />
          <p className={s.cardDesc}>{desc}</p>
        </section>
      ))}
    </div>
  );
}
```

O knob já mostra o seu rótulo, por isso só a Boca leva cabeçalho.

- [ ] **Step 5: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test
git add src/ui/controls/Knob.tsx src/ui/controls/Knob.module.css src/ui/shell/effects.tsx src/ui/shell/EffectsDrawer.tsx src/ui/shell/shell.module.css
git commit -m "feat: add effects registry and effects drawer content"
```

---

### Task 6: Seletor de instrumentos

**Files:**
- Create: `src/ui/shell/InstrumentPicker.tsx`, `src/ui/shell/InstrumentPicker.module.css`

**Interfaces:**
- Consumes: `searchInstruments`, `filterByFamily`, `groupByFamily`, `recentInfos` (Task 1), `recentInstruments` (Task 2), `instrumentIcon` (`src/ui/icons/InstrumentIcons.tsx`), `FAMILIES`
- Produces: `<InstrumentPicker />`. Filas com `data-testid="tile-<id>"` e `aria-pressed`; recentes com `data-testid="recent-<id>"`; campo com `data-testid="instrument-search"`.

- [ ] **Step 1: `InstrumentPicker.tsx`**

```tsx
// Seletor de instrumentos preparado para muitos sons: pesquisa, recentes, chips de família e
// filas compactas agrupadas por família.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { InstrumentInfo } from '../../audio/instruments';
import { FAMILIES } from '../../audio/patches/types';
import { useStore } from '../../state/store';
import { instrumentIcon } from '../icons/InstrumentIcons';
import p from '../panels/panels.module.css';
import { filterByFamily, groupByFamily, recentInfos, searchInstruments } from './logic';
import s from './InstrumentPicker.module.css';

const FILTERS = ['Todos', ...FAMILIES];

function Row({
  info,
  active,
  onPick,
  testId,
}: {
  info: InstrumentInfo;
  active: boolean;
  onPick: (id: string) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className={s.row}
      aria-pressed={active}
      onClick={() => onPick(info.id)}
      title={info.desc}
      data-row=""
      data-testid={testId}
    >
      <span className={s.icon}>{instrumentIcon(info.id)}</span>
      <span className={s.name}>{info.name}</span>
      <span className={s.desc}>{info.desc}</span>
    </button>
  );
}

export function InstrumentPicker() {
  const instrument = useStore((st) => st.instrument);
  const filter = useStore((st) => st.familyFilter);
  const recents = useStore((st) => st.recentInstruments);
  const set = useStore((st) => st.set);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => input.current?.focus(), []);

  const pick = (id: string) => set({ instrument: id });
  const found = searchInstruments(q, filterByFamily(filter));
  const groups = groupByFamily(found);
  const recent = !q.trim() && filter === 'Todos' ? recentInfos(recents) : [];

  // ↑/↓ entre filas; ↓ no campo de pesquisa salta para a primeira.
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    const rows = [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-row]') ?? [])];
    if (!rows.length) return;
    e.preventDefault();
    const k = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (k < 0) rows[d > 0 ? 0 : rows.length - 1].focus();
    else if (k + d < 0) input.current?.focus();
    else rows[Math.min(rows.length - 1, k + d)].focus();
  };

  return (
    <div className={s.picker} onKeyDown={onKey} data-testid="instruments">
      <input
        ref={input}
        type="search"
        className={s.search}
        placeholder="Procurar instrumento…"
        aria-label="Procurar instrumento"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-testid="instrument-search"
      />
      <div className={p.filters} role="group" aria-label="Filtrar por família">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={p.chip}
            aria-pressed={filter === f}
            onClick={() => set({ familyFilter: f })}
          >
            {f}
          </button>
        ))}
      </div>
      <div ref={list} className={s.list}>
        {recent.length > 0 && (
          <section aria-label="Recentes">
            <h3 className={s.group}>Recentes</h3>
            {recent.map((i) => (
              <Row
                key={i.id}
                info={i}
                active={instrument === i.id}
                onPick={pick}
                testId={`recent-${i.id}`}
              />
            ))}
          </section>
        )}
        {groups.map((g) => (
          <section key={g.family} aria-label={g.family}>
            <h3 className={s.group}>
              {g.family} <span>{g.items.length}</span>
            </h3>
            {g.items.map((i) => (
              <Row
                key={i.id}
                info={i}
                active={instrument === i.id}
                onPick={pick}
                testId={`tile-${i.id}`}
              />
            ))}
          </section>
        ))}
        {!groups.length && <p className={s.empty}>Nenhum instrumento encontrado.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `InstrumentPicker.module.css`**

```css
.picker {
  display: grid;
  gap: 10px;
  min-height: 0;
}
.search {
  width: 100%;
  padding: 9px 12px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--tile-bg);
  color: var(--ink);
  font: inherit;
}
.search:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 1px;
}
.list {
  display: grid;
  gap: 4px;
}
.group {
  margin: 10px 0 4px;
  font-family: var(--font-title);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.group span {
  opacity: 0.6;
}
.row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  grid-template-rows: auto auto;
  column-gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink);
  text-align: left;
}
.row:hover {
  background: var(--tile-bg);
  border-color: var(--line);
}
.row[aria-pressed='true'] {
  border-color: var(--cyan);
  background: linear-gradient(160deg, rgba(53, 224, 255, 0.14), rgba(139, 92, 255, 0.1));
}
.row:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 1px;
}
.icon {
  grid-row: 1 / 3;
  display: grid;
  place-items: center;
  color: var(--muted);
}
.icon svg {
  width: 28px;
  height: 28px;
}
.row[aria-pressed='true'] .icon {
  color: var(--cyan);
}
.name {
  font-size: 13.5px;
  font-weight: 600;
}
.desc {
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty {
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}
```

- [ ] **Step 3: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test
git add src/ui/shell/InstrumentPicker.tsx src/ui/shell/InstrumentPicker.module.css
git commit -m "feat: add searchable instrument picker with recents"
```

---

### Task 7: Teclas partilhadas, atalhos, ecrã inteiro e esconder automaticamente

**Files:**
- Create: `src/lib/keys.ts`, `src/lib/keys.test.ts`
- Modify: `src/app/session.ts:387-399` (usar `isTypingTarget`)
- Create: `src/ui/shell/fullscreen.ts`, `src/ui/shell/shortcuts.ts`, `src/ui/shell/useAutoHide.ts`

**Interfaces:**
- Consumes: `nextInstrument` (Task 1), `uiHidden`, `drawer` (Task 2)
- Produces:
  - `isTypingTarget(t: KeyTarget | null): boolean`, com `interface KeyTarget { tagName: string; isContentEditable?: boolean; getAttribute(name: string): string | null }`
  - `toggleFullscreen(): void`, `useFullscreen(): { active: boolean; toggle: () => void }`
  - `installShortcuts(): () => void`
  - `useAutoHide(active: boolean, ms?: number): boolean` (devolve `true` enquanto a barra deve espreitar)

- [ ] **Step 1: Teste que falha, `src/lib/keys.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './keys';

const el = (tagName: string, attrs: Record<string, string> = {}, editable = false) => ({
  tagName,
  isContentEditable: editable,
  getAttribute: (n: string) => attrs[n] ?? null,
});

describe('isTypingTarget', () => {
  it('campos de texto, seletores e sliders contam como escrita', () => {
    expect(isTypingTarget(el('INPUT'))).toBe(true);
    expect(isTypingTarget(el('TEXTAREA'))).toBe(true);
    expect(isTypingTarget(el('SELECT'))).toBe(true);
    expect(isTypingTarget(el('DIV', {}, true))).toBe(true);
    expect(isTypingTarget(el('DIV', { role: 'slider' }))).toBe(true);
  });
  it('botões e o corpo não contam', () => {
    expect(isTypingTarget(el('BUTTON'))).toBe(false);
    expect(isTypingTarget(el('BODY'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
```

Run: `npx vitest run src/lib/keys.test.ts`
Expected: FAIL (módulo inexistente)

- [ ] **Step 2: `src/lib/keys.ts`**

```ts
// Regra partilhada pelas notas do teclado e pelos atalhos: não reagir enquanto se escreve ou
// se ajusta um controlo (decisão 14).
export interface KeyTarget {
  tagName: string;
  isContentEditable?: boolean;
  getAttribute(name: string): string | null;
}

export function isTypingTarget(t: KeyTarget | null): boolean {
  if (!t || typeof t.tagName !== 'string') return false;
  const tag = t.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    !!t.isContentEditable ||
    t.getAttribute('role') === 'slider'
  );
}
```

Run: `npx vitest run src/lib/keys.test.ts`
Expected: PASS

- [ ] **Step 3: `session.installKeyboard` usa a regra partilhada**

Em `src/app/session.ts`, apagar a função local `typing` (linhas 388–399) e trocar os dois usos `typing(e)` por `isTypingTarget(e.target as HTMLElement | null)`. Acrescentar `import { isTypingTarget } from '../lib/keys';`.

- [ ] **Step 4: `src/ui/shell/fullscreen.ts`**

```ts
// Ecrã inteiro com a Fullscreen API; onde não existe (iPhone), esconde a interface.
import { useEffect, useState } from 'react';
import { getState } from '../../state/store';

export function toggleFullscreen(): void {
  const hide = () => getState().set({ uiHidden: !getState().uiHidden });
  if (!document.fullscreenEnabled) return hide();
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(hide);
}

export function useFullscreen(): { active: boolean; toggle: () => void } {
  const [active, setActive] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return { active, toggle: toggleFullscreen };
}
```

- [ ] **Step 5: `src/ui/shell/shortcuts.ts`**

```ts
// Atalhos da interface: I esconder, E ecrã inteiro, , e . instrumento, Esc volta a mostrar.
// H e F já tocam notas; [ e ] precisam de AltGr no teclado português.
import { isTypingTarget } from '../../lib/keys';
import { getState } from '../../state/store';
import { toggleFullscreen } from './fullscreen';
import { nextInstrument } from './logic';

export function installShortcuts(): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (isTypingTarget(e.target as HTMLElement | null)) return;
    const st = getState();
    if (st.settingsOpen) return;
    const k = e.key.toLowerCase();
    if (k === 'i') st.set({ uiHidden: !st.uiHidden });
    else if (k === 'e') toggleFullscreen();
    else if (k === ',' || k === '.')
      st.set({ instrument: nextInstrument(st.instrument, k === '.' ? 1 : -1, st.familyFilter) });
    else if (k === 'escape' && st.uiHidden && !st.drawer) st.set({ uiHidden: false });
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', down);
  return () => window.removeEventListener('keydown', down);
}
```

- [ ] **Step 6: `src/ui/shell/useAutoHide.ts`**

```ts
// Com a interface escondida, mexer o rato ou tocar mostra a barra durante `ms`.
import { useEffect, useState } from 'react';

export function useAutoHide(active: boolean, ms = 3000): boolean {
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!active) return;
    let t = 0;
    const poke = () => {
      setPeek(true);
      clearTimeout(t);
      t = window.setTimeout(() => setPeek(false), ms);
    };
    window.addEventListener('pointermove', poke);
    window.addEventListener('pointerdown', poke);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointermove', poke);
      window.removeEventListener('pointerdown', poke);
    };
  }, [active, ms]);
  return active && peek;
}
```

- [ ] **Step 7: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test
git add src/lib/keys.ts src/lib/keys.test.ts src/app/session.ts src/ui/shell/fullscreen.ts src/ui/shell/shortcuts.ts src/ui/shell/useAutoHide.ts
git commit -m "feat: add ui shortcuts, fullscreen toggle and auto-hide"
```

---

### Task 8: Gaveta (`<dialog>`), `DrawerHost` e `Panel` plano

**Files:**
- Create: `src/ui/shell/Drawer.tsx`, `src/ui/shell/Drawer.module.css`, `src/ui/shell/DrawerHost.tsx`
- Modify: `src/ui/panels/Panel.tsx`, `src/ui/panels/Panel.module.css`
- Modify: `src/ui/panels/RecordPanel.tsx` (sai o botão grande, que passa para a barra)

**Interfaces:**
- Consumes: `drawer` (Task 2), `DRAWER_TITLES` (Task 1), `InstrumentPicker` (Task 6), `EffectsDrawer` (Task 5)
- Produces:
  - `PanelFlat = createContext<string | null>(null)`, exportado de `Panel.tsx`. O valor é o título da gaveta; um `Panel` com o mesmo título esconde o seu.
  - `<Drawer title open onClose testId? children />`
  - `<DrawerHost />` com `data-testid="drawer"`

- [ ] **Step 1: `Panel` plano**

Em `src/ui/panels/Panel.tsx`:

```tsx
import { createContext, useContext, useId, useState, type ReactNode } from 'react';
…
/** Dentro de uma gaveta: título da gaveta (os painéis ficam planos, sem acordeão). */
export const PanelFlat = createContext<string | null>(null);

export function Panel({ title, extra, children, className, defaultOpen = true, testId }: Props) {
  const drawerTitle = useContext(PanelFlat);
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  if (drawerTitle !== null)
    return (
      <section
        className={`${s.flat} ${className ?? ''}`}
        aria-labelledby={title !== drawerTitle ? `${id}-t` : undefined}
        aria-label={title === drawerTitle ? title : undefined}
        data-testid={testId}
      >
        {(title !== drawerTitle || extra) && (
          <div className={s.head}>
            {title !== drawerTitle && (
              <h3 className={s.title} id={`${id}-t`}>
                {title}
              </h3>
            )}
            {extra && <div className={s.extra}>{extra}</div>}
          </div>
        )}
        {children}
      </section>
    );
  return ( /* … JSX atual sem alterações … */ );
}
```

Em `Panel.module.css`, acrescentar:

```css
.flat {
  min-width: 0;
}
.flat + .flat {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
```

- [ ] **Step 2: `RecordPanel` sem o botão grande**

Em `RecordPanel`, remover o `<button className={s.rec} …>` (o `data-testid="record"` passa para a barra na Task 9) e o import de `toggleRecording`. O `recording` também deixa de ser usado, por isso sai o `useStore((st) => st.recording)`. O `return` fica `<div className={s.wrap}><Panel title="Gravações" defaultOpen>…</Panel></div>`. O texto vazio passa a "Ainda não há gravações. Carrega em ⏺ na barra e toca."

- [ ] **Step 3: `Drawer.tsx`**

```tsx
// Gaveta sobre <dialog> modal: foco preso, Esc e inert nativos. O conteúdo só é montado
// enquanto está aberta, por isso os seus canvases e useFrame param quando fecha.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from '../controls/IconButton';
import { IconClose } from '../icons/UiIcons';
import { PanelFlat } from '../panels/Panel';
import s from './Drawer.module.css';

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}

export function Drawer({ title, open, onClose, children, testId }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      opener.current?.focus();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.drawer}
      aria-labelledby={`${id}-t`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      data-testid={testId}
    >
      <div className={s.inner}>
        <div className={s.head}>
          <h2 id={`${id}-t`}>{title}</h2>
          <IconButton small label={`Fechar ${title}`} onClick={onClose}>
            <IconClose width={16} height={16} />
          </IconButton>
        </div>
        <div className={s.body}>
          <PanelFlat.Provider value={title}>{open && children}</PanelFlat.Provider>
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 4: `Drawer.module.css`**

```css
.drawer {
  /* lateral direita, sobreposta ao palco */
  position: fixed;
  inset: 0 0 0 auto;
  margin: 0;
  width: min(360px, 100vw);
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  padding: 0;
  border: 0;
  border-left: 1px solid var(--line-strong);
  background: var(--glass-strong);
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
  color: var(--ink);
  box-shadow: -20px 0 60px rgba(0, 0, 0, 0.35);
}
.drawer::backdrop {
  background: rgba(6, 10, 22, 0.25);
}
.inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--line);
}
.head h2 {
  margin: 0;
  font-family: var(--font-title);
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px 16px 24px;
}
@media (max-width: 1099px) {
  .drawer {
    width: min(320px, 100vw);
  }
}
/* telemóvel: folha inferior até 70% da altura */
@media (max-width: 599px) {
  .drawer {
    inset: auto 0 0 0;
    width: 100vw;
    height: auto;
    max-height: 70dvh;
    border-left: 0;
    border-top: 1px solid var(--line-strong);
    border-radius: var(--radius) var(--radius) 0 0;
  }
  .inner {
    max-height: 70dvh;
  }
}
```

- [ ] **Step 5: `DrawerHost.tsx`**

```tsx
import { useRef, type ReactNode } from 'react';
import { useStore } from '../../state/store';
import type { DrawerId } from '../../state/types';
import { DrumPads } from '../bottom/DrumPads';
import { PianoKeyboard } from '../bottom/PianoKeyboard';
import { LooperPanel } from '../panels/LooperPanel';
import { RecordPanel } from '../panels/RecordPanel';
import { ScalePanel } from '../panels/ScalePanel';
import { TempoPanel } from '../panels/TempoPanel';
import { Drawer } from './Drawer';
import { EffectsDrawer } from './EffectsDrawer';
import { InstrumentPicker } from './InstrumentPicker';
import { DRAWER_TITLES } from './logic';
import s from './shell.module.css';

function content(id: DrawerId): ReactNode {
  switch (id) {
    case 'instrumentos':
      return <InstrumentPicker />;
    case 'escala':
      return <ScalePanel />;
    case 'efeitos':
      return <EffectsDrawer />;
    case 'tempo':
      return (
        <>
          <TempoPanel />
          <LooperPanel />
        </>
      );
    case 'gravacoes':
      return <RecordPanel />;
    case 'rato':
      return (
        <div className={s.mouse}>
          <PianoKeyboard />
          <DrumPads />
        </div>
      );
  }
}

export function DrawerHost() {
  const drawer = useStore((st) => st.drawer);
  const set = useStore((st) => st.set);
  // mantém o título durante o fecho, para não piscar
  const last = useRef<DrawerId>('instrumentos');
  if (drawer) last.current = drawer;
  return (
    <Drawer
      open={!!drawer}
      title={DRAWER_TITLES[drawer ?? last.current]}
      onClose={() => set({ drawer: null })}
      testId="drawer"
    >
      {drawer && content(drawer)}
    </Drawer>
  );
}
```

Acrescentar a `shell.module.css`:

```css
.mouse {
  display: grid;
  gap: 14px;
  justify-items: center;
}
```

Remover de `src/ui/bottom/bottom.module.css` os dois blocos `:global([data-view='musica']) …`.

- [ ] **Step 6: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test
git add src/ui/shell/Drawer.tsx src/ui/shell/Drawer.module.css src/ui/shell/DrawerHost.tsx src/ui/shell/shell.module.css src/ui/panels/Panel.tsx src/ui/panels/Panel.module.css src/ui/panels/RecordPanel.tsx src/ui/bottom/bottom.module.css
git commit -m "feat: add modal drawers that mount panels only while open"
```

(Nesta fase, `App.tsx` ainda usa o `RecordPanel` antigo sem botão. É esperado até à Task 10.)

---

### Task 9: Barra de controlo e menu ⋯

**Files:**
- Modify: `src/ui/icons/UiIcons.tsx` (ícones `IconEye`, `IconLoop`, `IconMore`, `IconExpand`, `IconShrink`)
- Create: `src/ui/shell/ControlBar.tsx`, `src/ui/shell/ControlBar.module.css`, `src/ui/shell/MoreMenu.tsx`

**Interfaces:**
- Consumes: `EFFECTS` (Task 5), `nextStageBg`, `STAGE_BGS`, `STAGE_BG_LABEL`, `DRAWER_IDS`, `DRAWER_TITLES` (Task 1), `toggleRecording` (`src/app/recording.ts`), `session.loopRecord()`
- Produces: `<ControlBar />` com os testids `control-bar`, `chip-instrument`, `chip-scale`, `chip-effects`, `chip-tempo`, `stage-bg`, `record`, `chip-recordings`, `loop-quick`, `more`, `quick-reverb` e `quick-echo`; `<MoreMenu />` com `menu-<drawerId>`, `menu-bg-<bg>` e `menu-hide`.

- [ ] **Step 1: Ícones** (no fim de `UiIcons.tsx`, no mesmo estilo)

```tsx
export const IconEye = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconLoop = (p: P) => (
  <svg {...base(p)}>
    <path d="M17 2l3 3-3 3" />
    <path d="M4 11V9a4 4 0 0 1 4-4h12" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M20 13v2a4 4 0 0 1-4 4H4" />
  </svg>
);
export const IconMore = (p: P) => (
  <svg {...base(p)}>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </svg>
);
export const IconExpand = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
export const IconShrink = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </svg>
);
```

- [ ] **Step 2: `MoreMenu.tsx`**

```tsx
// Menu ⋯: todas as gavetas, o fundo do palco e esconder a interface. No telemóvel é o menu principal.
import { useEffect, useRef, useState } from 'react';
import { useStore, type Prefs, type Runtime } from '../../state/store';
import { IconMore } from '../icons/UiIcons';
import { DRAWER_IDS, DRAWER_TITLES, STAGE_BG_LABEL, STAGE_BGS } from './logic';
import s from './ControlBar.module.css';

export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const bg = useStore((st) => st.stageBg);
  const set = useStore((st) => st.set);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  const pick = (p: Partial<Prefs & Runtime>) => {
    setOpen(false);
    set(p);
  };
  return (
    <div className={s.more} ref={root}>
      <button
        type="button"
        className={s.chip}
        aria-label="Mais opções"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="more"
      >
        <IconMore />
      </button>
      {open && (
        <div role="menu" className={s.menu} aria-label="Mais opções">
          {DRAWER_IDS.map((d) => (
            <button
              key={d}
              type="button"
              role="menuitem"
              onClick={() => pick({ drawer: d })}
              data-testid={`menu-${d}`}
            >
              {DRAWER_TITLES[d]}
            </button>
          ))}
          <div role="group" aria-label="Fundo do palco" className={s.menuGroup}>
            <span>Fundo do palco</span>
            {STAGE_BGS.map((b) => (
              <button
                key={b}
                type="button"
                role="menuitemradio"
                aria-checked={bg === b}
                onClick={() => pick({ stageBg: b })}
                data-testid={`menu-bg-${b}`}
              >
                {STAGE_BG_LABEL[b]}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick({ uiHidden: true })}
            data-testid="menu-hide"
          >
            Esconder interface <kbd>I</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
```

Confirmar que `Prefs` e `Runtime` são exportados de `store.ts` (são `export interface`).

- [ ] **Step 3: `ControlBar.tsx`**

```tsx
// Barra de controlo sobre o palco: só o essencial à vista; o resto abre gavetas.
import { useShallow } from 'zustand/react/shallow';
import { toggleRecording } from '../../app/recording';
import { session } from '../../app/session';
import { instrumentInfo } from '../../audio/instruments';
import { NOTE_NAMES } from '../../audio/theory';
import { useStore } from '../../state/store';
import type { DrawerId } from '../../state/types';
import { instrumentIcon } from '../icons/InstrumentIcons';
import { IconChevron, IconEye, IconLoop, IconMetronome, IconMusic, IconSliders } from '../icons/UiIcons';
import { EFFECTS } from './effects';
import { nextStageBg, STAGE_BG_LABEL } from './logic';
import { MoreMenu } from './MoreMenu';
import s from './ControlBar.module.css';

const LOOP_LABEL = {
  idle: 'Gravar loop',
  armed: 'Loop à espera do compasso',
  recording: 'Loop a gravar',
  playing: 'Sobrepor camada no loop',
} as const;

export function ControlBar() {
  const st = useStore(
    useShallow((x) => ({
      instrument: x.instrument,
      root: x.root,
      scale: x.scale,
      bpm: x.bpm,
      metronome: x.metronome,
      stageBg: x.stageBg,
      recording: x.recording,
      loop: x.looper.state,
      set: x.set,
    })),
  );
  const open = (d: DrawerId) => st.set({ drawer: d });
  const info = instrumentInfo(st.instrument);
  return (
    <nav className={s.bar} aria-label="Controlos" data-testid="control-bar">
      <button
        type="button"
        className={s.chip}
        aria-haspopup="dialog"
        onClick={() => open('instrumentos')}
        data-testid="chip-instrument"
        title="Instrumentos (, e . para mudar)"
      >
        <span className={s.ico}>{instrumentIcon(info.id)}</span>
        <span className={s.label}>{info.name}</span>
      </button>
      <button
        type="button"
        className={s.chip}
        aria-haspopup="dialog"
        onClick={() => open('escala')}
        data-testid="chip-scale"
        aria-label={`Escala: ${NOTE_NAMES[st.root]} ${st.scale}`}
      >
        <IconMusic />
        <span className={s.label}>
          {NOTE_NAMES[st.root]}
          <span className={s.long}> · {st.scale}</span>
        </span>
      </button>
      <div className={`${s.quick} ${s.wide}`}>
        {EFFECTS.filter((e) => e.quick).map(({ id, Control }) => (
          <Control key={id} size={30} testId={`quick-${id}`} />
        ))}
      </div>
      <button
        type="button"
        className={`${s.chip} ${s.mid}`}
        aria-haspopup="dialog"
        onClick={() => open('efeitos')}
        data-testid="chip-effects"
        aria-label="Efeitos"
      >
        <IconSliders />
        <span className={s.label}>Efeitos</span>
      </button>
      <button
        type="button"
        className={`${s.chip} ${s.mid}`}
        aria-haspopup="dialog"
        onClick={() => open('tempo')}
        data-testid="chip-tempo"
        aria-label={`Tempo ${st.bpm} BPM${st.metronome ? ', metrónomo ligado' : ''}`}
      >
        <IconMetronome />
        <span className={s.label}>{st.bpm}</span>
        {st.metronome && <i className={s.dot} aria-hidden />}
      </button>
      <button
        type="button"
        className={`${s.chip} ${s.mid}`}
        onClick={() => st.set({ stageBg: nextStageBg(st.stageBg) })}
        data-testid="stage-bg"
        aria-label={`Fundo do palco: ${STAGE_BG_LABEL[st.stageBg]}. Mudar`}
      >
        <IconEye />
        <span className={s.label}>{STAGE_BG_LABEL[st.stageBg]}</span>
      </button>
      <div className={s.recGroup}>
        <button
          type="button"
          className={s.rec}
          aria-pressed={st.recording}
          aria-label={st.recording ? 'Parar a gravação' : 'Gravar'}
          onClick={() => void toggleRecording()}
          data-testid="record"
        >
          <i aria-hidden />
        </button>
        <button
          type="button"
          className={s.recMore}
          aria-haspopup="dialog"
          aria-label="Gravações"
          onClick={() => open('gravacoes')}
          data-testid="chip-recordings"
        >
          <IconChevron width={14} height={14} />
        </button>
      </div>
      <button
        type="button"
        className={s.chip}
        data-state={st.loop}
        aria-label={LOOP_LABEL[st.loop]}
        title={LOOP_LABEL[st.loop]}
        onClick={() => session.loopRecord()}
        data-testid="loop-quick"
      >
        <IconLoop />
      </button>
      <MoreMenu />
    </nav>
  );
}
```

- [ ] **Step 4: `ControlBar.module.css`**

```css
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border-radius: 999px;
  background: var(--glass-strong);
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
  border: 1px solid var(--line-strong);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
  max-width: 100%;
}
.chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  min-width: 40px;
  justify-content: center;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  font-size: 13px;
  white-space: nowrap;
}
.chip:hover {
  border-color: var(--cyan);
}
.chip:focus-visible,
.rec:focus-visible,
.recMore:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}
.chip[data-state='recording'],
.chip[data-state='armed'] {
  border-color: var(--rec);
  color: var(--rec);
}
.chip[data-state='playing'] {
  border-color: var(--cyan);
  color: var(--cyan);
}
.ico svg {
  width: 22px;
  height: 22px;
  display: block;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: var(--glow);
}
.quick {
  display: flex;
  gap: 2px;
  padding: 0 4px;
}
/* no mini-knob só se vê o dial; o rótulo vai no title/aria */
.quick > div > span {
  display: none;
}
.recGroup {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 999px;
}
.rec {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 0;
  background: transparent;
  border-radius: 999px;
}
.rec i {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--rec);
  transition: border-radius var(--t-fast);
}
.rec[aria-pressed='true'] i {
  border-radius: 3px;
  box-shadow: 0 0 12px var(--rec);
}
.recMore {
  display: grid;
  place-items: center;
  width: 26px;
  height: 40px;
  border: 0;
  border-left: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  border-radius: 0 999px 999px 0;
}
.recMore svg {
  transform: rotate(-90deg);
}
.more {
  position: relative;
}
.menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  z-index: 10;
  display: grid;
  min-width: 220px;
  padding: 6px;
  border-radius: var(--radius-sm);
  background: var(--glass-strong);
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
  border: 1px solid var(--line-strong);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}
.menu button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  text-align: left;
  font-size: 13.5px;
}
.menu button:hover,
.menu button:focus-visible {
  background: var(--tile-bg);
  outline: none;
}
.menu [aria-checked='true'] {
  color: var(--cyan);
}
.menuGroup {
  display: grid;
  margin: 4px 0;
  padding: 4px 0;
  border-block: 1px solid var(--line);
}
.menuGroup > span {
  padding: 4px 12px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

/* 600–1099: sem mini-knobs e sem o nome longo da escala */
@media (max-width: 1099px) {
  .wide,
  .long {
    display: none;
  }
}
/* telemóvel: só ícones; Efeitos, Tempo e Fundo vão para o ⋯ */
@media (max-width: 599px) {
  .bar {
    border-radius: var(--radius-sm);
    justify-content: space-between;
    width: 100%;
  }
  .mid {
    display: none;
  }
  .label {
    max-width: 9ch;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
/* paisagem baixa: barra vertical */
@media (max-height: 499px) and (orientation: landscape) {
  .bar {
    flex-direction: column;
    border-radius: var(--radius-sm);
  }
  .label,
  .wide {
    display: none;
  }
  .menu {
    bottom: auto;
    top: 0;
    right: calc(100% + 10px);
  }
}
```

- [ ] **Step 5: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test
git add src/ui/icons/UiIcons.tsx src/ui/shell/ControlBar.tsx src/ui/shell/ControlBar.module.css src/ui/shell/MoreMenu.tsx
git commit -m "feat: add control bar and more menu"
```

---

### Task 10: Montar o shell novo e remover o layout antigo

**Files:**
- Modify: `src/app/App.tsx`, `src/app/App.module.css`, `src/app/TopBar.tsx`, `src/app/TopBar.module.css`
- Modify: `src/ui/stage/CameraStage.tsx`, `src/ui/stage/CameraStage.module.css`
- Modify: `src/ui/stage/HudOverlay.tsx` (chip do looper e estatísticas `?debug`)
- Modify: `src/ui/panels/SettingsDialog.tsx` (controlos do Sound Maker, `showWaves`, atalhos)
- Modify: `src/state/store.ts`, `src/state/types.ts` (remover `view`/`View`)
- Delete: `src/ui/controls/Tabs.tsx`, `src/ui/panels/VisualizerPanel.tsx`, `src/ui/panels/SoundMakerPanel.tsx`, `src/ui/panels/StatusPanel.tsx`, `src/ui/panels/InstrumentSelect.tsx`, `src/ui/panels/EffectsPanel.tsx`, `src/ui/bottom/BottomStrip.tsx`, `src/ui/bottom/WaveformStrip.tsx`
- Modify: `src/ui/controls/controls.module.css`, `src/ui/panels/panels.module.css` (CSS morto)

**Interfaces:**
- Consumes: tudo o que foi feito nas Tasks 1 a 9.

- [ ] **Step 1: `App.tsx`**

```tsx
import { useEffect } from 'react';
import { useStore } from '../state/store';
import { session } from './session';
import { SettingsDialog } from '../ui/panels/SettingsDialog';
import { ControlBar } from '../ui/shell/ControlBar';
import { DrawerHost } from '../ui/shell/DrawerHost';
import { installRecents } from '../ui/shell/recents';
import { installShortcuts } from '../ui/shell/shortcuts';
import { useAutoHide } from '../ui/shell/useAutoHide';
import { WaveViz } from '../ui/shell/WaveViz';
import { CameraStage } from '../ui/stage/CameraStage';
import s from './App.module.css';
import { TopBar } from './TopBar';

export function App() {
  const theme = useStore((st) => st.theme);
  const uiHidden = useStore((st) => st.uiHidden);
  const stageBg = useStore((st) => st.stageBg);
  const showWaves = useStore((st) => st.showWaves);
  const size = useStore((st) => st.videoSize);
  const peek = useAutoHide(uiHidden);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const offs = [
      session.installKeyboard(),
      session.installStoreSync(),
      installRecents(),
      installShortcuts(),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <div className={s.app} data-ui={uiHidden ? (peek ? 'peek' : 'hidden') : 'shown'}>
      <TopBar />
      <main className={s.main} id="conteudo">
        <div
          className={s.stageBox}
          style={size ? { ['--ar' as string]: size.w / size.h } : undefined}
        >
          <CameraStage onStart={() => void session.start()} />
          <div className={s.barSlot} data-testid="bar-slot">
            <ControlBar />
          </div>
        </div>
        {stageBg === 'camara' && showWaves && <WaveViz className={s.strip} />}
      </main>
      <DrawerHost />
      <SettingsDialog />
    </div>
  );
}
```

- [ ] **Step 2: `App.module.css`** (substituir tudo)

```css
.app {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 14px 12px;
  max-width: 1720px;
  margin: 0 auto;
  overflow: hidden;
}
.main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
/* O palco ocupa o espaço livre, na proporção da câmara (--ar), sem nunca transbordar. */
.stageBox {
  --ar: 1.7778;
  --sw: min(100cqw, 100cqh * var(--ar));
  --sh: min(100cqh, 100cqw / var(--ar));
  position: relative;
  flex: 1;
  min-height: 0;
  container-type: size;
  display: grid;
  place-items: center;
}
.barSlot {
  position: absolute;
  left: 50%;
  bottom: calc((100cqh - var(--sh)) / 2 + 12px);
  transform: translateX(-50%);
  max-width: calc(var(--sw) - 24px);
  z-index: 4;
  transition: opacity var(--t-med);
}
.strip {
  flex: none;
  display: block;
  width: 100%;
  height: 60px;
  border-radius: var(--radius-sm);
  background: var(--canvas-bg);
}

/* Interface escondida: só palco e HUD; a barra espreita com o rato/toque. */
.app[data-ui='hidden'] > header,
.app[data-ui='peek'] > header,
.app[data-ui='hidden'] .strip,
.app[data-ui='peek'] .strip {
  display: none;
}
.app[data-ui='hidden'] .barSlot {
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 1099px) {
  .strip {
    display: none;
  }
}
/* telemóvel: palco à largura toda e barra por baixo */
@media (max-width: 599px) {
  .app {
    padding: 8px 0 12px;
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }
  .stageBox {
    flex: none;
    container-type: normal;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 8px;
  }
  .barSlot {
    position: static;
    transform: none;
    max-width: none;
  }
  .app[data-ui='hidden'] .barSlot {
    display: none;
  }
}
/* paisagem baixa: barra vertical à direita do palco */
@media (max-height: 499px) and (orientation: landscape) {
  .app {
    padding: 6px 10px;
    gap: 6px;
  }
  .barSlot {
    left: auto;
    bottom: auto;
    top: 50%;
    right: calc((100cqw - var(--sw)) / 2 + 8px);
    transform: translateY(-50%);
    max-width: none;
    max-height: calc(var(--sh) - 16px);
  }
}
```

- [ ] **Step 3: `CameraStage` ajusta-se ao `stageBox`**

Em `CameraStage.tsx`: remover a prop `bottom` (e o `{bottom && …}`), deixando `interface Props { onStart: () => void; }`. Remover o `style` do `.stage` (o `--ar` vem agora do `stageBox`) e a leitura de `videoSize`.

Em `CameraStage.module.css`: `.window` passa a:

```css
.window {
  width: var(--sw, 100%);
  aspect-ratio: var(--ar, 1.7778);
  background: var(--glass);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(53, 224, 255, 0.08),
    0 20px 60px rgba(0, 0, 0, 0.35);
}
```

(sem `backdrop-filter`: o palco é opaco e o blur custa GPU). `.stage` passa a `position: relative; width: 100%; height: 100%; background: var(--stage-bg); overflow: hidden;`, sem `aspect-ratio` nem `--ar`. Remover a regra `.bottom`. No `@media (max-width: 600px)`, `.window` acrescenta `width: 100%;`. Como aí o `.stageBox` não é contentor de tamanho, a proporção vem do `aspect-ratio`.

- [ ] **Step 4: `TopBar.tsx`**

```tsx
import { useStore } from '../state/store';
import { IconButton } from '../ui/controls/IconButton';
import { IconExpand, IconLogo, IconMute, IconSettings, IconShrink, IconVolume } from '../ui/icons/UiIcons';
import { useFullscreen } from '../ui/shell/fullscreen';
import s from './TopBar.module.css';

export function TopBar() {
  const muted = useStore((st) => st.muted);
  const set = useStore((st) => st.set);
  const fs = useFullscreen();
  return (
    <header className={s.bar}>
      <h1 className={s.brand}>
        <IconLogo />
        <span>Vision Sound Cam</span>
      </h1>
      <div className={s.actions}>
        <IconButton
          label={fs.active ? 'Sair do ecrã inteiro (E)' : 'Ecrã inteiro (E)'}
          aria-pressed={fs.active}
          onClick={fs.toggle}
          data-testid="fullscreen"
        >
          {fs.active ? <IconShrink /> : <IconExpand />}
        </IconButton>
        <IconButton
          label={muted ? 'Ligar o som' : 'Silenciar'}
          aria-pressed={muted}
          onClick={() => set({ muted: !muted })}
        >
          {muted ? <IconMute /> : <IconVolume />}
        </IconButton>
        <IconButton label="Definições" onClick={() => set({ settingsOpen: true })}>
          <IconSettings />
        </IconButton>
      </div>
    </header>
  );
}
```

`TopBar.module.css`: `.bar` passa a `display: flex; align-items: center; justify-content: space-between; gap: 12px;`. Remover `.center` e os dois `@media` antigos e acrescentar `@media (max-width: 599px) { .bar { padding: 0 8px; } .brand span { font-size: 14px; } }`.

- [ ] **Step 5: HUD, chip do looper e diagnóstico**

Em `HudOverlay.tsx`, ler `const loop = useStore((st) => st.looper.state);`. Na coluna direita, antes do chip "Voz", acrescentar:

```tsx
        {loop !== 'idle' && (
          <span className={s.chip} data-testid="hud-loop">
            Loop:{' '}
            <b>{{ armed: 'à espera', recording: 'a gravar', playing: 'a tocar' }[loop]}</b>
          </span>
        )}
```

Em `Fps`, quando `DEBUG` (`import { DEBUG } from '../../lib/debug'`) e `frameStats` (`import { frameStats } from '../frame'`), mostrar também a UI:

```tsx
function Fps() {
  const [t, setT] = useState({ fps: live.fps, ui: frameStats.fps, ms: frameStats.ms });
  useEffect(() => {
    const id = setInterval(
      () => setT({ fps: live.fps, ui: frameStats.fps, ms: frameStats.ms }),
      1000,
    );
    return () => clearInterval(id);
  }, []);
  if (!t.fps) return null;
  return (
    <b data-testid="hud-fps">
      {t.fps} fps{DEBUG && ` · ui ${t.ui} fps · ${t.ms} ms`}
    </b>
  );
}
```

- [ ] **Step 6: Definições**

Em `SettingsDialog.tsx`, acrescentar ao seletor `octave`, `heightPitch`, `glide`, `sensitivity` e `showWaves`. Depois da secção "Mãos", acrescentar:

```tsx
        <section className={s.section}>
          <h3>Tocar</h3>
          <Slider
            label="Oitava base"
            min={1}
            max={6}
            value={st.octave}
            onChange={(v) => st.set({ octave: v })}
          />
          <Slider
            label="Sensibilidade da visão"
            min={0}
            max={100}
            value={Math.round(st.sensitivity * 100)}
            onChange={(v) => st.set({ sensitivity: v / 100 })}
            format={(v) => `${v}%`}
          />
          <Toggle
            label="Altura da mão muda o tom"
            checked={st.heightPitch}
            onChange={(v) => st.set({ heightPitch: v })}
          />
          <Toggle
            label="Deslizar o tom enquanto seguras"
            checked={st.glide}
            onChange={(v) => st.set({ glide: v })}
          />
        </section>
```

Em "Som e aspeto", a seguir ao volume:

```tsx
          <Toggle
            label="Mostrar ondas por baixo do palco"
            checked={st.showWaves}
            onChange={(v) => st.set({ showWaves: v })}
            testId="show-waves"
          />
```

No fim, antes de `</div></dialog>`:

```tsx
        <section className={s.section}>
          <h3>Atalhos</h3>
          <dl className={s.keys}>
            <dt><kbd>A</kbd>…<kbd>Ç</kbd></dt><dd>Tocar com os dedos (sem câmara)</dd>
            <dt><kbd>Espaço</kbd></dt><dd>Simular a boca aberta</dd>
            <dt><kbd>,</kbd> <kbd>.</kbd></dt><dd>Instrumento anterior / seguinte</dd>
            <dt><kbd>I</kbd></dt><dd>Esconder / mostrar a interface</dd>
            <dt><kbd>E</kbd></dt><dd>Ecrã inteiro</dd>
            <dt><kbd>Esc</kbd></dt><dd>Fechar a gaveta ou voltar a mostrar a interface</dd>
          </dl>
        </section>
```

Em `SettingsDialog.module.css`:

```css
.keys {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 14px;
  margin: 0;
  font-size: 13px;
}
.keys dt {
  white-space: nowrap;
}
.keys dd {
  margin: 0;
  color: var(--muted);
}
```

(o Prettier do lint vai reformatar o `<dl>`; correr `npx prettier --write` se o lint o pedir).

- [ ] **Step 7: Remover `view` e os ficheiros antigos**

`src/state/types.ts`: apagar `export type View = …`. `src/state/store.ts`: tirar `View` do import, `view: View;` de `Runtime` e `view: 'som',` do estado inicial.

```bash
git rm src/ui/controls/Tabs.tsx src/ui/panels/VisualizerPanel.tsx src/ui/panels/SoundMakerPanel.tsx src/ui/panels/StatusPanel.tsx src/ui/panels/InstrumentSelect.tsx src/ui/panels/EffectsPanel.tsx src/ui/bottom/BottomStrip.tsx src/ui/bottom/WaveformStrip.tsx
grep -rn "Tabs\|VisualizerPanel\|SoundMakerPanel\|StatusPanel\|InstrumentSelect\|EffectsPanel\|BottomStrip\|WaveformStrip\|data-view\|\.view\b" src
```

Expected: o `grep` não encontra nada.

- [ ] **Step 8: CSS morto**

Em `controls.module.css`, apagar `.tabs`, `.tab`, `.tab[aria-selected='true']` e `.tab:hover`. Para cada classe de `panels.module.css` (`canvas`, `canvasSm`, `grid`, `tile`, `knobs`, `dots`, `dot`, `status`, `recOn`, `engine`, `row`), correr `grep -rn "s\.<classe>\b\|p\.<classe>\b" src/ui src/app` e apagar só as que já não aparecem. Não apagar `filters`, `chip`, `mouthSel`, `sub`, `meter`, `bar`, `meterTxt`, `desc`, `btn`, `seg`, `field`, `tempoRow`, `beats`, `progress`, `loopInfo`, `btnRec`, `scaleList` nem as do `ScalePanel`.

Se `src/ui/bottom/bottom.module.css` tiver regras `.strip`, `.scroll` ou `.wave`, que só eram usadas pelo `BottomStrip` e pelo `WaveformStrip`, apagá-las também (confirmar primeiro com `grep`).

- [ ] **Step 9: Ver a funcionar**

Run: `npm run dev` e abrir `http://localhost:5173/?debug`. Confirmar:
- a 1440×900: palco grande, barra sobre o fundo do palco, faixa de ondas por baixo;
- clicar no chip do instrumento abre a gaveta à direita, a pesquisa filtra, Esc fecha e o foco volta ao chip;
- `I` esconde e `Esc` volta a mostrar; `E` entra em ecrã inteiro; `,` e `.` mudam de instrumento;
- nas DevTools, em 390×844 e 844×390, sem scroll horizontal.

- [ ] **Step 10: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test
git add -A src
git commit -m "feat: replace three-column layout with stage-first shell"
```

---

### Task 11: Testes e2e do fluxo novo e das resoluções

**Files:**
- Modify: `e2e/app.spec.ts`

**Interfaces:**
- Consumes: os testids das Tasks 6, 8, 9 e 10.

- [ ] **Step 1: Reescrever o teste principal**

Em `e2e/app.spec.ts`, substituir o corpo de `test('liga a câmara, toca todos os instrumentos e grava', …)` a partir de `// todas as tiles de instrumento` até antes de `expect(errors…)` por:

```ts
  // gaveta dos instrumentos: todas as filas
  await page.getByTestId('chip-instrument').click();
  const drawer = page.getByTestId('drawer');
  await expect(drawer).toBeVisible();
  const tiles = drawer.locator('[data-testid^="tile-"]');
  const n = await tiles.count();
  expect(n).toBeGreaterThanOrEqual(29);
  for (let k = 0; k < n; k++) {
    const t = tiles.nth(k);
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
  }

  // pesquisa sem acentos; escrever não toca notas nem dispara atalhos
  const search = page.getByTestId('instrument-search');
  await search.fill('mari');
  await expect(drawer.locator('[data-testid^="tile-"]')).toHaveCount(1);
  await search.fill('asdf ie.,');
  await expect(page.getByText('Nenhum instrumento encontrado.')).toBeVisible();
  const hidden = await page.evaluate(
    () => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().uiHidden,
  );
  expect(hidden).toBe(false);
  await expect(page.getByTestId('hud-note')).toHaveText('—');
  await search.fill('');
  await drawer.getByTestId('tile-piano').click();

  // Esc fecha e devolve o foco ao chip
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('chip-instrument')).toBeFocused();

  // teclado (modo teclado) com um instrumento melódico
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  for (const k of ['a', 's', 'd', 'j', 'k', 'l']) {
    await page.keyboard.down(k);
    await page.waitForTimeout(60);
    await page.keyboard.up(k);
  }
  await expect(page.getByTestId('hud-note')).not.toHaveText('—');

  // , e . mudam de instrumento
  const before = await page.evaluate(
    () => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().instrument,
  );
  await page.keyboard.press('.');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().instrument),
    )
    .not.toBe(before);
  await page.keyboard.press(',');

  // tocar com o rato (menu ⋯): teclado de piano e pads
  await page.getByTestId('more').click();
  await page.getByTestId('menu-rato').click();
  const key = drawer.locator('[data-testid^="key-"]').nth(5);
  await key.hover();
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.evaluate(() =>
    (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ instrument: 'drums' }),
  );
  await drawer.getByTestId('pad-1').click();
  await expect(page.getByTestId('hud-note')).toHaveText('Tarola');
  await page.keyboard.press('Escape');

  // pipeline real de gestos com mãos sintéticas: dobrar o médio esquerdo dispara uma nota
  await page.evaluate(() =>
    (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ instrument: 'marimba' }),
  );
  const note = await playSynthetic(page);
  expect(note).toMatch(/^(Dó|Ré|Mi|Fá|Sol|Lá|Si)♯?\d$/);

  // gravar 2 s pela barra; a gravação aparece na gaveta
  await page.getByTestId('record').click();
  await expect(page.getByTestId('record')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(2000);
  await page.getByTestId('record').click();
  await page.getByTestId('chip-recordings').click();
  await expect(page.getByTestId('recording-item')).toHaveCount(1, { timeout: 10_000 });
  await page.keyboard.press('Escape');
```

O tipo `Vsc` passa a:

```ts
type Vsc = {
  session: { feedHands(h: unknown[]): void };
  syntheticHand(closed: boolean[] | boolean, x?: number, y?: number): unknown;
  store: {
    getState(): {
      instrument: string;
      lastNote: string;
      engine: string;
      uiHidden: boolean;
      stageBg: string;
      set(p: Record<string, unknown>): void;
    };
  };
};
```

E, a seguir a `watchConsole`, entram dois helpers reutilizados pelos testes novos:

```ts
async function startCamera(page: Page) {
  await page.getByTestId('start').click();
  await expect
    .poll(
      () =>
        page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().engine),
      { timeout: 30_000 },
    )
    .toBe('hands');
}

/** Dobra o médio esquerdo com mãos sintéticas e devolve a última nota. */
function playSynthetic(page: Page) {
  return page.evaluate(async () => {
    const v = (window as unknown as { __vsc: Vsc }).__vsc;
    const open = [v.syntheticHand(false, 0.3), v.syntheticHand(false, 0.7)];
    const bent = [
      v.syntheticHand([false, false, true, false, false], 0.3),
      v.syntheticHand(false, 0.7),
    ];
    const wait = () => new Promise((r) => setTimeout(r, 33));
    for (const hands of [open, open, open, open, bent, bent, bent, bent]) {
      v.session.feedHands(hands);
      await wait();
    }
    return v.store.getState().lastNote;
  });
}
```

(o bloco inline antigo das mãos sintéticas sai; o teste principal usa `playSynthetic`).

- [ ] **Step 2: Testes novos** (acrescentar antes de `test.describe('sem internet', …)`)

```ts
test('fundo do palco: só mãos esconde a pessoa e a deteção continua', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await startCamera(page);
  await page.getByTestId('stage-bg').click();
  await expect(page.getByTestId('stage-bg')).toContainText('Só mãos');
  await expect(page.getByTestId('video')).toHaveCSS('opacity', '0');
  expect(await playSynthetic(page)).toMatch(/\d$/);
  await page.getByTestId('stage-bg').click();
  await expect(page.getByTestId('stage-waves')).toBeVisible();
  await page.getByTestId('stage-bg').click();
  await expect(page.getByTestId('video')).toHaveCSS('opacity', '1');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('esconder interface com I e voltar com Esc', async ({ page }) => {
  await page.goto('/?debug');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('i');
  await expect(page.getByTestId('bar-slot')).toHaveCSS('opacity', '0');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('bar-slot')).toHaveCSS('opacity', '1');
});

test('uma gaveta de cada vez', async ({ page }) => {
  await page.goto('/?debug');
  await page.getByTestId('chip-scale').click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByTestId('scale-panel')).toBeVisible();
  // clicar fora fecha
  await page.mouse.click(10, 300);
  await expect(page.getByTestId('drawer')).toBeHidden();
  await expect(page.getByTestId('scale-panel')).toHaveCount(0);
});

test('sem Fullscreen API (iPhone), o botão esconde a interface', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false }),
  );
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.getByTestId('fullscreen').click();
  await expect(page.getByTestId('bar-slot')).toHaveCSS('opacity', '0');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('preferências da v1 com a câmara escondida abrem em só mãos', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'vision-sound-cam:prefs',
      JSON.stringify({ state: { showVideo: false, instrument: 'marimba' }, version: 1 }),
    );
  });
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await expect(page.getByTestId('stage-bg')).toContainText('Só mãos');
  await expect(page.getByTestId('chip-instrument')).toContainText('Marimba');
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const vp of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 320, height: 568 },
]) {
  test(`layout ${vp.width}×${vp.height}: sem scroll horizontal, palco e barra à vista`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/?debug');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('stage')).toBeInViewport();
    await expect(page.getByTestId('control-bar')).toBeInViewport();
    await expect(page.getByTestId('chip-instrument')).toBeInViewport();
    await expect(page.getByTestId('more')).toBeInViewport();
  });
}
```

Se o nome mostrado do patch `marimba` não for "Marimba", usar o nome real de `src/audio/patches/mallets.ts`.

- [ ] **Step 3: Correr**

Run: `npm run test:e2e`
Expected: todos PASS. Se o teste 320×568 falhar por `overflow` > 0, reduzir `padding` e `gap` do `.bar` em `ControlBar.module.css` dentro do `@media (max-width: 599px)` (por exemplo `gap: 2px; padding: 4px;` e `.chip { padding: 0 8px; }`) até passar. Não esconder o chip de instrumento, o ⏺ nem o ⋯.

- [ ] **Step 4: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test
git add e2e/app.spec.ts src/ui/shell/ControlBar.module.css
git commit -m "test: cover the new shell, stage backgrounds and viewports in e2e"
```

---

### Task 12: Medição de desempenho, documentação e GIF

**Files:**
- Create: `scripts/perf-probe.mjs`
- Modify: `docs/DECISIONS.md`, `CHANGELOG.md`, `README.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md`
- Regenerate: `docs/demo.gif`

- [ ] **Step 1: `scripts/perf-probe.mjs`**

```js
// Mede FPS do rAF, intervalo p95 entre fotogramas e canvases visíveis durante 15 s a tocar.
// Uso: node scripts/perf-probe.mjs [url]   (por defeito http://localhost:4173/?debug)
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4173/?debug';
const b = await chromium.launch({
  channel: 'chromium',
  args: [
    ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera'] });
const p = await ctx.newPage();
await p.goto(url);
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.getByTestId('start').click();
await p.waitForTimeout(4000);
const r = await p.evaluate(
  () =>
    new Promise((res) => {
      const v = window.__vsc;
      let t = 0;
      const feed = setInterval(() => {
        t++;
        const bent = t % 8 < 4;
        v.session.feedHands([
          v.syntheticHand([false, false, bent, false, false], 0.3),
          v.syntheticHand(false, 0.7),
        ]);
      }, 33);
      const ts = [];
      const t0 = performance.now();
      const f = (now) => {
        ts.push(now);
        if (now - t0 < 15000) return requestAnimationFrame(f);
        clearInterval(feed);
        const d = ts
          .slice(1)
          .map((x, i) => x - ts[i])
          .sort((a, b) => a - b);
        const canvases = [...document.querySelectorAll('canvas')].filter((c) => {
          const bb = c.getBoundingClientRect();
          return bb.width > 0 && bb.height > 0;
        }).length;
        res({
          fps: Math.round((ts.length - 1) / ((ts.at(-1) - ts[0]) / 1000)),
          p95: +d[Math.floor(d.length * 0.95)].toFixed(1),
          canvases,
        });
      };
      requestAnimationFrame(f);
    }),
);
console.log(JSON.stringify(r));
await b.close();
```

- [ ] **Step 2: Medir a v1 e a v2**

```bash
# v2 (este ramo)
npm run build && (npx vite preview --port 4173 --strictPort &) && sleep 3
node scripts/perf-probe.mjs http://localhost:4173/?debug
# v1 (tag), noutra pasta e noutra porta
git worktree add ../handagio-v1 v1.0.0
(cd ../handagio-v1 && npm ci && npm run build && (npx vite preview --port 4174 --strictPort &)) && sleep 3
node scripts/perf-probe.mjs http://localhost:4174/?debug
```

Guardar os dois JSON. No fim, parar os dois `vite preview` (`pkill -f "vite preview"`) e remover a pasta da v1 com `git worktree remove ../handagio-v1`.

- [ ] **Step 3: `docs/DECISIONS.md`**

Acrescentar ao fim da decisão 30: ` *Substituída pela 33.*` e ao fim da 31: ` *A revisão do layout é a 33.*`. Depois, acrescentar no fim (substituir `<…>` pelos números medidos no Step 2):

```markdown
33. **Layout v2: palco em primeiro plano.** Saem as três colunas e os separadores Som / Música / Câmara. Fica um cabeçalho fino (ecrã inteiro, silenciar, definições), o palco a ocupar o espaço livre na proporção da câmara (container queries), uma barra de controlo sobre o fundo do palco e gavetas para o resto. Só o essencial fica à vista: instrumento, escala, reverb e eco, tempo, fundo, gravar e looper.
34. **Gavetas sobre `<dialog>` modal.** Dão de forma nativa o foco preso, o Esc e o `inert`; clicar fora fecha e o foco volta ao controlo que abriu. Só há uma aberta de cada vez e o conteúdo só é montado enquanto está aberta, por isso os `useFrame` dos painéis param. Dentro de uma gaveta, o `Panel` fica plano (sem acordeão). A câmara e as mãos continuam a funcionar por trás.
35. **Fundo do palco.** Câmara, Só mãos ou Ondas (substitui `showVideo`). Nos dois últimos, o `<video>` fica com `opacity: 0` e não com `display: none`, porque no iOS um vídeo escondido deixa de entregar fotogramas ao MediaPipe. A gravação de vídeo segue o fundo (`compositeSources`): a pessoa só aparece no ficheiro com o fundo Câmara.
36. **Um só visualizador.** As ondas sobrepostas (o antigo "Analisador dinâmico") ficam numa faixa por baixo do palco (≥ 1100 px, opção "Mostrar ondas") ou em grande com o fundo Ondas. Saem as barras de espectro, o osciloscópio e o espectro do Sound Maker. `useCanvas` deixa de desenhar canvases fora do ecrã ou de tamanho 0, exceto os do palco (`always`), que a gravação compõe.
37. **Atalhos.** `I` esconder a interface, `E` ecrã inteiro, `,` e `.` instrumento anterior e seguinte, Esc fechar ou voltar a mostrar. `H` e `F` já tocam notas, e `[` e `]` precisam de AltGr no teclado português. Seguem a regra da decisão 14 (`isTypingTarget`, agora em `src/lib/keys.ts`).
38. **Registo de efeitos.** `src/ui/shell/effects.tsx` lista os efeitos (id, nome, descrição, controlo, `quick`). O delay é o "Eco". Um efeito novo é uma entrada no registo mais o nó em `src/audio`.
39. **Seletor de instrumentos.** Pesquisa sem acentos (nome, família e descrição), até 6 recentes (`recentInstruments`, que ignora ids que já não existam), chips de família e filas compactas agrupadas. Os recentes atualizam-se com qualquer mudança de instrumento (UI, preset ou atalho).
40. **Migração das preferências (v1 → v2).** O `persist` passa à versão 2: `showVideo: false` passa a `stageBg: 'maos'`, caso contrário `'camara'`; os campos novos recebem os valores por defeito.
41. **Desempenho medido** com `scripts/perf-probe.mjs` (1440×900, câmara falsa, 15 s a tocar, mesma máquina): v1 `<fps>` fps, p95 `<p95>` ms, `<n>` canvases; v2 `<fps>` fps, p95 `<p95>` ms, `<n>` canvases.
```

- [ ] **Step 4: `CHANGELOG.md`** (secção nova no topo, por cima de `## [1.0.0]`)

```markdown
## [2.0.0] — por lançar

Interface redesenhada para pôr o foco em tocar. A lógica de som e de visão não muda.

- Palco da câmara em primeiro plano, com uma barra de controlo e gavetas no lugar das três colunas e dos separadores.
- Ecrã inteiro (`E`) e esconder interface (`I`), com a barra a espreitar ao mexer o rato.
- Fundo do palco: Câmara, Só mãos (a pessoa não aparece, nem na gravação) ou Ondas.
- Um só visualizador (ondas sobrepostas); os canvases fora do ecrã deixam de desenhar.
- Seletor de instrumentos com pesquisa, recentes e grupos por família; `,` e `.` mudam de instrumento.
- Efeitos em cartões (reverb, eco/delay, pitch, filtro, drive, boca), com reverb e eco à mão na barra.
- Layout para telemóvel (folha inferior), tablet, desktop e paisagem baixa.
- Oitava, sensibilidade, altura da mão e deslizar passam para as Definições, com a lista de atalhos.
```

e, no fim do ficheiro, `[2.0.0]: https://github.com/zealves/handagio/releases/tag/v2.0.0`.

- [ ] **Step 5: README, ARCHITECTURE e CLAUDE.md**

`README.md`: substituir as três linhas das vistas (**Som**, **Música**, **Câmara**) por uma descrição do palco, da barra, das gavetas, do fundo do palco e dos atalhos `I`, `E`, `,`, `.`. Fazer `grep -n "vista\|separador" README.md docs/ARCHITECTURE.md` e atualizar cada ocorrência. Em `docs/ARCHITECTURE.md`, acrescentar `src/ui/shell/` (barra, gavetas, seletor, registo de efeitos, atalhos). Em `CLAUDE.md`, no resumo da arquitetura, acrescentar a linha:

```markdown
- `src/ui/shell/` tem a barra de controlo, as gavetas (`<dialog>`, conteúdo só montado quando abertas), o seletor de instrumentos, o registo de efeitos e os atalhos (`I`, `E`, `,`, `.`); a lógica pura está em `logic.ts`.
```

- [ ] **Step 6: GIF**

Run: `npm run dev` (noutro terminal) e depois `node scripts/make-demo-gif.mjs`.
Expected: "docs/demo.gif gerado." Abrir o GIF e confirmar que mostra o layout novo.

- [ ] **Step 7: Verificar e fazer commit**

```bash
npm run build && npm run lint && npm test && npm run test:e2e
git add scripts/perf-probe.mjs docs/DECISIONS.md CHANGELOG.md README.md docs/ARCHITECTURE.md CLAUDE.md docs/demo.gif
git commit -m "docs: document the v2 shell, decisions and performance numbers"
```

---

### Task 13: Lançamento v2.0.0 (só com a aprovação do utilizador)

- [ ] **Step 1: Revisão final do ramo.** Pedir ao utilizador que experimente o `npm run dev` e aprove.

- [ ] **Step 2: Versão**

```bash
npm version 2.0.0 --no-git-tag-version
```

Em `CHANGELOG.md`, trocar `— por lançar` pela data do dia (AAAA-MM-DD).

```bash
npm run build && npm run lint && npm test
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: release v2.0.0"
```

- [ ] **Step 3: Merge e tag**

```bash
git switch main
git merge --no-ff redesign/v2 -m "feat: merge ui redesign v2"
git tag -a v2.0.0 -m "v2.0.0: stage-first interface with control bar and drawers"
```

- [ ] **Step 4: Push só com confirmação explícita.** `git push origin main v2.0.0` faz deploy para handagio.com. Perguntar antes.
