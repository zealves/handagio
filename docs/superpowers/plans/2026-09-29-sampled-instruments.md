# Instrumentos com amostras reais — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os instrumentos acústicos passam a tocar a partir de gravações reais (tonejs-instruments, CC-BY 3.0), com registo próprio por instrumento e notas que não são cortadas num toque curto. Chegam 9 instrumentos novos. Nada muda na forma de tocar.

**Architecture:**
- **Preparação:** um script de desenvolvimento descarrega as amostras, reduz-lhes o tamanho e escreve em `public/samples/` (no git) um `manifest.json` e um `CREDITS.md`.
- **Motor, em `src/audio/samples/` (sem React):**
  - `notes.ts`: lógica pura;
  - `catalog.ts`: definição dos instrumentos com amostras;
  - `loader.ts`: `fetch` e descodificação, com estado por instrumento;
  - `sampler.ts`: voz com a interface `Voice` já existente.
- **Integração:** `AudioEngine.noteOn` usa o sampler quando os buffers estão prontos e, enquanto carregam, o patch sintetizado de reserva. O registo entra pela `Tuning` (oitava + registo).

**Tech Stack:**
- TypeScript estrito, Web Audio nativa (`AudioBufferSourceNode`), Zustand, Vitest (node) e Playwright;
- no script, `mpg123-decoder` (WASM) e `@breezystack/lamejs` como dependências de desenvolvimento.

**Spec:** `docs/superpowers/specs/2026-09-29-sampled-instruments-design.md`

## Global Constraints

- Ramo `redesign/v2`. Nunca fazer push nem mexer em `main`.
- Português de Portugal na UI e nos comentários. `src/audio` não importa React. Valores a 60 fps não vão para estado React.
- Antes de cada commit: `npm run build && npm run lint && npm test`, com o lint a zero avisos.
- Commits em inglês, Conventional Commits, assunto em minúsculas e no imperativo, sem ponto final. Autor único, sem `Co-Authored-By` nem outras linhas de atribuição.
- Amostras só de fontes CC0 ou CC-BY, com atribuição em `public/samples/CREDITS.md`, no README e nas Definições.
- ≤ 250 KB por instrumento e ≤ 4 MB no total em `public/samples/`.
- Os ids existentes (`piano`, `violin`, `cello`, `bass`, `flute`, `sax`, `brass`, `organ`, `harp`) mantêm-se, para os presets, o looper e os recentes.
- Tocar nunca pode ficar mudo ou dar erro por causa do carregamento. Enquanto carrega, soa o patch de reserva; se falhar, continua o de reserva e a UI mostra o erro.
- Nota sustentada: nunca é cortada antes de 250 ms depois do início.

## Review Focus

1. **Instrumento escolhido e tocado de imediato, antes de as amostras chegarem:** tem de soar (reserva) e mudar para amostras sem cliques nem erros. Testado nas Tasks 4 e 6.
2. **Sem rede na primeira escolha de um instrumento:** a UI mostra o erro, o som sai da reserva e não aparece nenhum erro na consola. Testado na Task 6.
3. **Looper ou preset com um instrumento com amostras ainda não carregado:** carrega e toca a reserva até lá. Testado na Task 4.
4. **Notas muito agudas ou graves, longe de qualquer amostra** (registo + oitava 1 ou 6 + pitch ±12): a amostra mais próxima com `playbackRate` limitado a [0.25, 4], sem silêncio nem distorção. Testado na Task 1.
5. **Toques muito rápidos e repetidos no mesmo dedo** (a mesma chave de voz): a voz anterior termina e não se acumulam vozes. Testado na Task 4.

---

### Task 1: Lógica pura de notas e amostras

**Files:**
- Create: `src/audio/samples/notes.ts`, `src/audio/samples/notes.test.ts`

**Interfaces:**
- Produces:
  - `noteToMidi(name: string): number`: `'A4'`→69, `'Cs5'`/`'C#5'`→73, `'Db3'`→49; lança erro com um nome inválido
  - `nearestSample(midi: number, notes: number[]): number`: devolve a nota da amostra mais próxima; em caso de empate, a de baixo
  - `playbackRateFor(targetMidi: number, sampleMidi: number): number`: `2^((t−s)/12)` limitado a [0.25, 4]
  - `releaseTime(now: number, startAt: number, minHold = 0.25): number`: `max(now, startAt + minHold)`

- [ ] **Step 1: Testes (a falhar)** em `src/audio/samples/notes.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { nearestSample, noteToMidi, playbackRateFor, releaseTime } from './notes';

describe('noteToMidi', () => {
  it('lê naturais, sustenidos (s ou #) e bemóis', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('Cs5')).toBe(73);
    expect(noteToMidi('C#5')).toBe(73);
    expect(noteToMidi('Db3')).toBe(49);
    expect(noteToMidi('A0')).toBe(21);
  });
  it('rejeita nomes inválidos', () => {
    expect(() => noteToMidi('H2')).toThrow();
    expect(() => noteToMidi('C')).toThrow();
  });
});

describe('nearestSample', () => {
  const notes = [48, 55, 60, 67];
  it('escolhe a mais próxima; em empate a de baixo', () => {
    expect(nearestSample(61, notes)).toBe(60);
    expect(nearestSample(64, notes)).toBe(67);
    expect(nearestSample(51, notes)).toBe(48); // 51 está a 3 de 48 e a 4 de 55
    expect(nearestSample(63, [60, 66])).toBe(60); // empate
  });
  it('fora do intervalo usa o extremo', () => {
    expect(nearestSample(10, notes)).toBe(48);
    expect(nearestSample(120, notes)).toBe(67);
  });
});

describe('playbackRateFor', () => {
  it('uma oitava acima duplica', () => {
    expect(playbackRateFor(72, 60)).toBeCloseTo(2);
    expect(playbackRateFor(60, 60)).toBe(1);
    expect(playbackRateFor(59, 60)).toBeCloseTo(0.9439, 3);
  });
  it('limita a [0.25, 4]', () => {
    expect(playbackRateFor(120, 60)).toBe(4);
    expect(playbackRateFor(0, 60)).toBe(0.25);
  });
});

describe('releaseTime', () => {
  it('nunca antes de 250 ms depois do início', () => {
    expect(releaseTime(10.1, 10)).toBeCloseTo(10.25);
    expect(releaseTime(11, 10)).toBe(11);
    expect(releaseTime(10.1, 10, 0.05)).toBeCloseTo(10.1);
  });
});
```

Run: `npx vitest run src/audio/samples/notes.test.ts`
Expected: FAIL (módulo inexistente)

- [ ] **Step 2: Implementação** em `src/audio/samples/notes.ts`

```ts
// Lógica pura das amostras: nomes de notas, amostra mais próxima, velocidade de reprodução e
// momento de libertação (um toque curto ainda deixa ouvir o instrumento).
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(name: string): number {
  const m = /^([A-G])(s|#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Nota inválida: ${name}`);
  const acc = m[2] === 's' || m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + acc;
}

export function nearestSample(midi: number, notes: number[]): number {
  let best = notes[0];
  for (const n of notes) {
    const d = Math.abs(n - midi);
    const bd = Math.abs(best - midi);
    if (d < bd || (d === bd && n < best)) best = n;
  }
  return best;
}

export const playbackRateFor = (targetMidi: number, sampleMidi: number): number =>
  Math.min(4, Math.max(0.25, Math.pow(2, (targetMidi - sampleMidi) / 12)));

export const releaseTime = (now: number, startAt: number, minHold = 0.25): number =>
  Math.max(now, startAt + minHold);
```

- [ ] **Step 3: Ver passar**, depois `npm run build && npm run lint && npm test`

- [ ] **Step 4: Commit**: `feat: add pure note and sample selection helpers`

---

### Task 2: Preparação das amostras (script, ficheiros, manifest, créditos)

**Files:**
- Create: `scripts/prepare-samples.mjs`, `public/samples/manifest.json`, `public/samples/<id>/*.mp3`, `public/samples/CREDITS.md`
- Modify: `package.json` (devDependencies e script `prepare-samples`)

**Interfaces:**
- Produces: `public/samples/manifest.json` com a forma

```json
{
  "version": 1,
  "instruments": {
    "violin": {
      "source": "violin",
      "origin": "VSCO 2 Community Edition (CC0)",
      "notes": { "G3": 2.5, "C4": 2.5 },
      "gain": 1.0
    }
  }
}
```

(`notes`: nome da nota → duração em segundos depois do corte; `gain`: fator de normalização calculado pelo script para que todas as amostras de todos os instrumentos fiquem com o mesmo RMS, −20 dBFS, medido nos primeiros 500 ms.)

**Ids e origem** (pasta da tonejs-instruments):

| id | pasta | kind | durMax | registo pretendido |
|---|---|---|---|---|
| `piano` | piano | struck | 3.0 | C3–C6 |
| `violin` | violin | sustained | 3.0 | G3–E6 |
| `cello` | cello, só se a licença Freesound for confirmada como CC0/CC-BY; caso contrário, contrabass | sustained | 3.0 | C2–C5 |
| `bass` | bass-electric | plucked | 2.5 | E1–G3 |
| `contrabass` | contrabass | sustained | 3.0 | E1–G3 |
| `flute` | flute | sustained | 3.0 | C4–C7 |
| `clarinet` | clarinet | sustained | 3.0 | D3–C6 |
| `sax` | saxophone | sustained | 3.0 | Db3–A5 |
| `brass` | trumpet | sustained | 3.0 | F3–C6 |
| `horn` | french-horn | sustained | 3.0 | C2–F5 |
| `trombone` | trombone | sustained | 3.0 | C2–C5 |
| `tuba` | tuba | sustained | 3.0 | D1–F4 |
| `bassoon` | bassoon | sustained | 3.0 | Bb1–E5 |
| `organ` | organ | sustained | 3.0 | C2–C6 |
| `harp` | harp | plucked | 3.0 | C2–C7 |
| `guitar` | guitar-acoustic | plucked | 3.0 | E2–E5 |
| `eguitar` | guitar-electric | plucked | 3.0 | E2–E5 |
| `xylophone` | xylophone | struck | 1.5 | C4–C8 |

- [ ] **Step 1: Confirmar os ficheiros e as licenças.**
  - Listar os `.mp3` de cada pasta com `gh api repos/nbrosowsky/tonejs-instruments/contents/samples/<pasta> --jq '.[].name'`.
  - Ler `sample-source-info.txt` (`gh api repos/nbrosowsky/tonejs-instruments/contents/sample-source-info.txt --jq .content | base64 -d`).
  - **Violoncelo:** a origem é o Freesound (pack 12408 de flcellogrl). Confirmar a licença com `WebFetch` à página do pack ou dos sons. Se não for CC0 nem CC-BY, `cello` usa a pasta `contrabass`; registar a decisão em `CREDITS.md` e no relatório.
- [ ] **Step 2: Dependências de desenvolvimento:** `npm i -D mpg123-decoder @breezystack/lamejs`. Confirmar que ambos funcionam em Node (ESM) com um teste rápido no scratchpad. Se algum não funcionar, escolher uma alternativa em JS/WASM puro sem binários nativos e dizer qual no relatório. `ffmpeg` não está instalado e não pode ser exigido.
- [ ] **Step 3: `scripts/prepare-samples.mjs`.** Para cada id da tabela:
  - **escolher as notas:** as notas disponíveis na pasta dentro do registo pretendido, reduzidas a 6–8, espaçadas de ~4–6 semitons e cobrindo todo o registo;
  - **descarregar** de `https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/<pasta>/<ficheiro>`, com cache em `node_modules/.cache/samples/`;
  - **descodificar** e converter para mono (média dos canais);
  - **cortar** para `durMax`, com fade-out linear de 150 ms e fade-in de 3 ms;
  - **medir** o RMS dos primeiros 500 ms e calcular `gain = 10^(-20/20) / rms`, com a média por instrumento limitada a [0.25, 4];
  - **codificar** MP3 mono a 96 kbps (80 kbps se o instrumento passar de 250 KB), a 44.1 kHz; reamostrar de forma linear se a fonte tiver outra taxa;
  - **escrever** `public/samples/<id>/<Nota>.mp3`, usando o nome da nota da pasta de origem com sustenido como `s` (por exemplo `Cs4`);
  - **no fim**, escrever `manifest.json` (ordenado por id) e `CREDITS.md`:
    - atribuição CC-BY 3.0 à biblioteca tonejs-instruments (Nicholas Brosowsky), com ligação e licença;
    - a origem de cada instrumento (VSCO 2 CC0, Karoryfer, Universidade de Iowa, Freesound com autor e licença) e a nota "amostras cortadas, convertidas para mono e comprimidas".
  - **imprimir** o tamanho por instrumento e o total. Falha com código ≠ 0 se algum instrumento passar de 250 KB ou o total de 4 MB.
  - `package.json`: acrescentar `"prepare-samples": "node scripts/prepare-samples.mjs"`. **Não** fica ligado ao `prebuild`: o resultado vive no git.
- [ ] **Step 4: Correr** `npm run prepare-samples`, confirmar os limites e ouvir 2–3 ficheiros não é possível aqui. Em vez disso, verificar com um script que cada MP3 descodifica, tem a duração esperada (±5%) e não está em silêncio (RMS > 0.01).
- [ ] **Step 5: Commit** dos ficheiros (`git add public/samples scripts/prepare-samples.mjs package.json package-lock.json`): `feat: add prepared instrument samples with credits`

---

### Task 3: Catálogo com amostras, registo e reserva

**Files:**
- Create: `src/audio/samples/catalog.ts`, `src/audio/samples/catalog.test.ts`
- Modify: `src/audio/instruments.ts`, `src/audio/patches/types.ts` (se for preciso para `Family`), `src/app/session.ts:99-101,145`, `src/ui/panels/ScalePanel.tsx:36`, `src/ui/icons/InstrumentIcons.tsx`

**Interfaces:**
- Consumes: `public/samples/manifest.json` (Task 2)
- Produces:

```ts
export type SampleKind = 'sustained' | 'plucked' | 'struck';
export interface SampledDef {
  id: string;
  name: string;
  family: Exclude<Family, 'Percussão'>;
  desc: string;
  kind: SampleKind;
  /** Oitavas somadas à oitava base. */
  register: number;
  /** Constante de tempo da libertação (sustained, struck). */
  rel: number;
  /** Patch sintetizado usado enquanto as amostras carregam ou se falharem. */
  fallback: string;
}
export const SAMPLED: SampledDef[];
export const SAMPLED_BY_ID: Record<string, SampledDef>;
export const isSampled: (id: string) => boolean;
```

e em `src/audio/instruments.ts`:
- `InstrumentInfo` ganha `sampled: boolean`;
- nova função `tuningOf(s: { root: number; scale: ScaleName; octave: number; instrument: string }): Tuning`, que devolve a oitava + registo.

- [ ] **Step 1: `catalog.ts`**, com as entradas abaixo (nomes e descrições em PT-PT; os dados dos ficheiros vêm do manifest, não daqui):

| id | name | family | kind | register | rel | fallback | desc |
|---|---|---|---|---|---|---|---|
| piano | Piano | Teclas | struck | 0 | 0.4 | piano | Piano de cauda gravado. |
| organ | Órgão | Teclas | sustained | 0 | 0.1 | organ | Órgão de tubos; sustenta enquanto seguras. |
| violin | Violino | Cordas | sustained | 0 | 0.2 | violin | Violino com arco. |
| cello | Violoncelo | Cordas | sustained | −1 | 0.25 | cello | Cordas graves e quentes. |
| contrabass | Contrabaixo | Cordas | sustained | −2 | 0.25 | cello | O mais grave das cordas. |
| bass | Baixo elétrico | Cordas | plucked | −2 | 0.2 | bass | Baixo dedilhado. |
| harp | Harpa | Cordas | plucked | 0 | 0.3 | harp | Cordas beliscadas que ressoam. |
| guitar | Guitarra acústica | Cordas | plucked | −1 | 0.3 | pluck | Cordas de aço, dedilhadas. |
| eguitar | Guitarra elétrica | Cordas | plucked | −1 | 0.3 | pluck | Guitarra limpa, sem distorção. |
| flute | Flauta | Sopros | sustained | 1 | 0.15 | flute | Flauta transversal. |
| clarinet | Clarinete | Sopros | sustained | 0 | 0.15 | flute | Madeira escura e redonda. |
| sax | Saxofone | Sopros | sustained | 0 | 0.15 | sax | Saxofone expressivo. |
| bassoon | Fagote | Sopros | sustained | −1 | 0.15 | sax | Madeira grave. |
| brass | Trompete | Sopros | sustained | 0 | 0.12 | brass | Metal brilhante. |
| horn | Trompa | Sopros | sustained | −1 | 0.15 | brass | Metal suave e redondo. |
| trombone | Trombone | Sopros | sustained | −1 | 0.15 | brass | Metal grave. |
| tuba | Tuba | Sopros | sustained | −2 | 0.15 | brass | O mais grave dos metais. |
| xylophone | Xilofone | Lâminas | struck | 1 | 0.3 | marimba | Lâminas de madeira, secas e brilhantes. |

- [ ] **Step 2: Testes** (`catalog.test.ts`, em node):
  - cada id de `SAMPLED` existe em `public/samples/manifest.json` (ler com `fs`), com ≥ 4 notas, todas com um nome válido (`noteToMidi` não lança) e com o ficheiro em disco;
  - cada `fallback` existe em `PATCHES`;
  - os ids são únicos e não colidem com ids de percussão.
- [ ] **Step 3: `instruments.ts`:**
  - `INSTRUMENTS` passa a ser: os patches sintetizados **cujo id não está em `SAMPLED`**, mais os `SAMPLED` (`kind: 'melodic'`, `sustain: kind === 'sustained'`, `sampled: true`), mais os kits;
  - a ordem segue `FAMILIES` e, dentro de cada família, primeiro os instrumentos com amostras;
  - `sampled: false` nos restantes;
  - `tuningOf(s) = { root: s.root, scale: s.scale, octave: s.octave + (SAMPLED_BY_ID[s.instrument]?.register ?? 0) }`.
- [ ] **Step 4: Usar `tuningOf`:**
  - em `session.fingerMidi` (`degreeToMidi(…, tuningOf(s))`);
  - em `session.ts:145` (`chordMidis(…, tuningOf(s), s.chord)`);
  - em `ScalePanel.tsx:36`, que precisa de `instrument` no seletor.
  - O deslizar e a altura da mão ficam iguais, porque derivam do `fingerMidi`.
- [ ] **Step 5: Ícones.** Em `InstrumentIcons.tsx`, os ids novos usam ícones existentes:
  - `contrabass` → cello;
  - `guitar` e `eguitar` → pluck ou harp;
  - `clarinet` e `bassoon` → flute ou sax;
  - `horn`, `trombone` e `tuba` → brass;
  - `xylophone` → marimba.
  - Reaproveitar os mesmos nós SVG.
- [ ] **Step 6: Testes existentes.** `instruments.test.ts` e `logic.test.ts` podem assumir contagens (≥ 29) ou famílias; ajustar só o que mudou por causa do catálogo e explicar no relatório. `npm run build && npm run lint && npm test`.
- [ ] **Step 7: Commit**: `feat: add sampled instrument catalog with per-instrument register`

---

### Task 4: Carregamento, voz com amostras e integração no motor

**Files:**
- Create: `src/audio/samples/loader.ts`, `src/audio/samples/sampler.ts`
- Modify: `src/audio/engine.ts` (`noteOn`, `init`), `src/audio/voice.ts` (bug do LFO), `src/app/session.ts` (carregar ao escolher), `src/state/store.ts` (runtime `sampleStatus`)

**Interfaces:**
- Consumes: `SAMPLED_BY_ID`, `noteToMidi`, `nearestSample`, `playbackRateFor`, `releaseTime`, o manifest
- Produces:
  - `class SampleBank { status(id): 'idle' | 'loading' | 'ready' | 'error'; load(ctx, id): Promise<void>; get(id): { notes: number[]; buffers: Map<number, AudioBuffer>; gain: number } | null; on('status', fn({ id, status })) }`, com uma única instância exportada `samples`
  - `playSample(ctx, bank entry, def, dest, freq, vel, pan, when): Voice`
  - Store runtime: `sampleStatus: Record<string, 'loading' | 'ready' | 'error'>`

- [ ] **Step 1: `loader.ts`:**
  - `fetch('samples/manifest.json')` uma só vez, com um caminho relativo que funcione sob `handagio.com/`; usar `import.meta.env.BASE_URL`;
  - `load(ctx, id)` é idempotente enquanto está `loading` ou `ready`;
  - `load` faz `fetch` de cada nota em paralelo, depois `arrayBuffer` e `ctx.decodeAudioData`;
  - se alguma nota falhar, o estado passa a `error` e não se lança nada para fora (fica um `console.warn` com o prefixo `[amostras]`);
  - `load` pode ser chamado de novo depois de um erro, o que conta como tentar outra vez;
  - `Emitter` de `src/lib/emitter.ts` para `status`.
- [ ] **Step 2: `sampler.ts`, `playSample`:**
  - `t = max(when ?? 0, ctx.currentTime)`;
  - o `targetMidi` vem de `freq` (`freqToMidi`) e a amostra do `nearestSample`;
  - uma `AudioBufferSourceNode` com `playbackRate = playbackRateFor(...)`;
  - `sustained`: `loop = true`, `loopStart = 0.45·dur` e `loopEnd = 0.9·dur`;
  - a cadeia é fonte → `BiquadFilter` passa-baixo (`1500 + vel·12000` Hz, Q 0.5) → ganho (`gain_manifest · 0.5 · (0.15 + 0.85·vel)`, ataque de 5 ms com `linearRamp` a partir de 0) → `StereoPanner` → `dest`;
  - `setFreq(fr)`: `playbackRate.setTargetAtTime(playbackRateFor(freqToMidi(fr), sampleMidi), now, 0.04)`;
  - `release()`:
    - `plucked`: não faz nada (toca até ao fim);
    - `struck` e `sustained`: `at = releaseTime(ctx.currentTime, t)`, depois `gain.setTargetAtTime(0, at, def.rel)` e `stop(at + def.rel·6)`;
  - `kill()`: rampa de 10 ms e `stop`;
  - `onended` desliga todos os nós, marca `done` e chama `onDone`;
  - fora do `loop`, a fonte para no fim do buffer (a duração real é `dur / playbackRate`).
- [ ] **Step 3: `engine.noteOn`:**
  - se `SAMPLED_BY_ID[patchId]` existir:
    - se `samples.status(id) === 'ready'`, usar `playSample`;
    - caso contrário, chamar `samples.load(this.ctx, id)` sem esperar (sem duplicados) e tocar `PATCHES[def.fallback]` pelo caminho atual;
  - o resto (vozes, `noteOff`, `glide`, pitch global através de `freq·pitchFactor`) não muda.
- [ ] **Step 4: Carregar ao escolher.** Em `session.installStoreSync`, quando `instrument` muda, se `isSampled`, chamar `samples.load(audio.ctx, id)` (só depois de `audio.ready`). No `session.start`/`ensureAudio`, carregar o instrumento atual. `samples.on('status')` → `setState({ sampleStatus: { ...prev, [id]: status } })`, e `idle` não entra.
- [ ] **Step 5: Bug do LFO** (desvio consciente do protótipo). Em `voice.ts`, o kit regista os LFOs cujo destino é `out.gain`, ou todos os LFOs, que é mais simples. No `release()` e no `kill()`, o `gain` desses LFOs vai a 0 com `setTargetAtTime(0, n, r/2)`. Assim `glass` e `epiano` deixam de soar depois de largar.
- [ ] **Step 6: Testes** (em node, sem `AudioContext`):
  - separar a lógica de decisão numa função pura exportada `chooseVoice(status, def) → 'sample' | 'fallback'` e testá-la;
  - com um `fetch` falso (`vi.stubGlobal`) e um `ctx` falso com `decodeAudioData`, testar em `loader.test.ts` os estados `loading → ready`, a idempotência (um só `fetch` por nota com dois `load` seguidos) e `loading → error` quando o `fetch` responde 404, sem rejeitar;
  - `npm run build && npm run lint && npm test`.
- [ ] **Step 7: Verificação no browser** (script descartável no scratchpad, com `vite preview`):
  - escolher `violin` e esperar por `sampleStatus.violin === 'ready'`;
  - `__vsc.audio.noteOn(1, 'violin', 69, .8, 0)` dá um RMS do analisador > 0.01;
  - repetir 20 `noteOn`/`noteOff` rápidos na mesma chave e confirmar que o número de vozes ativas não cresce (expor uma contagem no `__vsc` se for preciso, só em debug);
  - tocar logo depois de escolher (antes de `ready`) produz som (reserva) e nenhum erro na consola.
- [ ] **Step 8: Commit(s)**: `feat: play acoustic instruments from recorded samples` e `fix: stop gain lfos when a voice is released`

---

### Task 5: Interface — estado de carregamento, indicação de gravado e créditos

**Files:**
- Modify: `src/ui/shell/InstrumentPicker.tsx` + `.module.css`, `src/ui/shell/ControlBar.tsx` + `.module.css`, `src/ui/panels/SettingsDialog.tsx`

**Interfaces:**
- Consumes: `sampleStatus` no store, `InstrumentInfo.sampled`

- [ ] **Step 1: Seletor:**
  - nas filas com `sampled`, um selo discreto "gravado" junto ao nome (texto pequeno, `color: var(--muted)`);
  - com `sampleStatus[id] === 'loading'`, um anel pequeno a girar no ícone (CSS, com `prefers-reduced-motion` a desligar a animação) e `aria-busy="true"` na fila;
  - com `error`, a descrição passa a "Não foi possível carregar — toca para tentar de novo", e clicar na fila chama `samples.load` outra vez, além de escolher o instrumento.
- [ ] **Step 2: Chip do instrumento na barra:**
  - o mesmo anel no ícone enquanto o instrumento atual está `loading`;
  - `aria-label` "Instrumento: Violino (a carregar)";
  - com `error`, um ponto vermelho pequeno no ícone.
- [ ] **Step 3: Definições:** nova secção "Créditos dos sons" no fim, com:
  - 2–3 linhas ("Os instrumentos gravados vêm da biblioteca tonejs-instruments (CC-BY 3.0), com amostras de VSCO 2, Karoryfer e Universidade de Iowa. Os restantes sons são sintetizados.");
  - uma ligação para `samples/CREDITS.md` (abre noutro separador).
- [ ] **Step 4: Verificar** que nada disto tira o foco nem mexe no layout: as filas mantêm a altura e a barra não muda de largura (anel sobreposto ao ícone, `position: absolute`).
- [ ] **Step 5:** `npm run build && npm run lint && npm test`. Commit: `feat: show sample loading state and sound credits`

---

### Task 6: e2e, medição e documentação

**Files:**
- Modify: `e2e/app.spec.ts`, `docs/DECISIONS.md`, `CHANGELOG.md`, `README.md`, `CLAUDE.md`
- Create (scratch, não no repo): a sonda de timbre (copiar a lógica de medição: `noteOn` de cada instrumento em A4 ou na nota equivalente do registo, espectro aos 300 ms, similaridade de cosseno entre pares)

- [ ] **Step 1: e2e novos:**
  - **"instrumento gravado carrega e toca":** abrir ⋯ → Instrumentos → `tile-violin`; esperar por um pedido `samples/violin/*.mp3` com resposta 200 e por `sampleStatus.violin === 'ready'` (via `__vsc.store`); `noteOn` direto e RMS > 0.01; o chip sem `(a carregar)`;
  - **"violino e flauta não soam iguais":**
    - carregar os dois;
    - tocar A4 em cada um, com a mesma velocidade;
    - ler `analyser.frequency()` aos 300 ms;
    - cosseno dos espectros (bins 0–255) < 0.9;
  - **"tocar enquanto carrega usa a reserva":** interceptar `samples/cello/**` com um atraso de 3 s (`page.route`); escolher `cello`, tocar de imediato e confirmar RMS > 0.01 e nenhum erro na consola;
  - **"sem rede na primeira escolha":**
    - `page.route('**/samples/tuba/**', r => r.abort())`;
    - escolher `tuba`;
    - `sampleStatus.tuba === 'error'`;
    - o texto de erro está visível na fila;
    - tocar ainda dá som;
    - a consola não tem erros (os `console.warn` `[amostras]` são permitidos);
  - **"depois de usado, funciona sem internet":** no teste offline existente, escolher `violin` e esperar `ready` antes de pôr offline; depois do `reload` offline, escolher `violin` de novo e esperar `ready`.
  - Correr `npm run test:e2e` até ficar verde.
- [ ] **Step 2: Medição.** Correr a sonda na v2 antes (commit `a73c290`) e depois, com todos os instrumentos melódicos visíveis no seletor, com toque de 200 ms. Registar a similaridade média entre pares e os 5 pares mais parecidos, antes e depois.
- [ ] **Step 3: Documentação:**
  - `DECISIONS.md`: nova decisão "Instrumentos gravados", com:
    - fonte e licenças;
    - preparação (mono, corte, 96 kbps, normalização a −20 dBFS);
    - tamanhos reais;
    - registo por instrumento;
    - mínimo de 250 ms;
    - reserva enquanto carrega;
    - números da medição;
    - correção do LFO (desvio do protótipo);
    - alteração da regra do `CLAUDE.md`.
  - `CHANGELOG.md` [2.0.0]: bullet "Instrumentos acústicos com gravações reais e 9 novos (contrabaixo, clarinete, fagote, trompa, trombone, tuba, guitarra acústica, guitarra elétrica, xilofone), cada um no seu registo."
  - `README.md`: secção "Créditos dos sons" e "Acrescentar um instrumento gravado" (`npm run prepare-samples`, tabela no script, entrada em `catalog.ts`).
  - `CLAUDE.md`, a regra de som passa a: "Fórmulas e valores de deteção e dos sons sintetizados vêm de `reference/maos-musicais.html`; não aproximar. Os instrumentos acústicos usam amostras em `public/samples/` (ver `CREDITS.md`); `npm run prepare-samples` regenera-as." E, em Comandos, acrescentar `npm run prepare-samples`.
- [ ] **Step 4:** `npm run build && npm run lint && npm test && npm run test:e2e`. Commits: `test: cover sampled instruments loading, fallback and timbre` e `docs: document recorded instruments and credits`
