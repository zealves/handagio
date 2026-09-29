// Prepara as amostras dos instrumentos acústicos a partir da biblioteca tonejs-instruments
// (CC-BY 3.0): escolhe 6–8 notas por instrumento, descodifica o WAV original, converte para mono,
// corta com fades curtos, mede o volume, codifica em MP3 mono e verifica o resultado. Corre à mão
// (`npm run prepare-samples`); o resultado em public/samples/ fica no git.
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MPEGDecoder } from 'mpg123-decoder';
import { Mp3Encoder } from '@breezystack/lamejs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'samples');
const cache = join(root, 'node_modules', '.cache', 'samples');
const REPO = 'nbrosowsky/tonejs-instruments';
const RAW = `https://raw.githubusercontent.com/${REPO}/master/samples`;

const RATE = 44100;
const FADE_IN = 0.003;
const FADE_OUT = 0.15;
const RMS_WINDOW = 0.5;
const TARGET_RMS = Math.pow(10, -20 / 20);
const MAX_INSTRUMENT = 250 * 1024;
const MAX_TOTAL = 4 * 1024 * 1024;
const MIN_NOTES = 6;
const MAX_NOTES = 8;

const VSCO = 'VSCO 2 Community Edition (CC0)';
const KARORYFER = 'Karoryfer Samples (CC0)';
const IOWA = 'University of Iowa Musical Instrument Samples (sem restrições)';
const FREESOUND_CELLO = 'Freesound, pack 12408 "Real Cello Notes" de flcellogrl (CC-BY 3.0)';

// id, pasta da biblioteca, tipo, duração máxima (s), registo pretendido, origem.
const INSTRUMENTS = [
  ['piano', 'piano', 'struck', 3.0, 'C3', 'C6', VSCO],
  ['violin', 'violin', 'sustained', 3.0, 'G3', 'E6', VSCO],
  ['cello', 'cello', 'sustained', 3.0, 'C2', 'C5', FREESOUND_CELLO],
  ['bass', 'bass-electric', 'plucked', 2.5, 'E1', 'G3', KARORYFER],
  ['contrabass', 'contrabass', 'sustained', 3.0, 'E1', 'G3', VSCO],
  ['flute', 'flute', 'sustained', 3.0, 'C4', 'C7', VSCO],
  ['clarinet', 'clarinet', 'sustained', 3.0, 'D3', 'C6', VSCO],
  ['sax', 'saxophone', 'sustained', 3.0, 'Db3', 'A5', KARORYFER],
  ['brass', 'trumpet', 'sustained', 3.0, 'F3', 'C6', VSCO],
  ['horn', 'french-horn', 'sustained', 3.0, 'C2', 'F5', VSCO],
  ['trombone', 'trombone', 'sustained', 3.0, 'C2', 'C5', VSCO],
  ['tuba', 'tuba', 'sustained', 3.0, 'D1', 'F4', VSCO],
  ['bassoon', 'bassoon', 'sustained', 3.0, 'Bb1', 'E5', VSCO],
  ['organ', 'organ', 'sustained', 3.0, 'C2', 'C6', VSCO],
  ['harp', 'harp', 'plucked', 3.0, 'C2', 'C7', VSCO],
  ['guitar', 'guitar-acoustic', 'plucked', 3.0, 'E2', 'E5', IOWA],
  ['eguitar', 'guitar-electric', 'plucked', 3.0, 'E2', 'E5', KARORYFER],
  ['xylophone', 'xylophone', 'struck', 1.5, 'C4', 'C8', VSCO],
].map(([id, folder, kind, durMax, lo, hi, origin]) => ({
  id,
  folder,
  kind,
  durMax,
  lo,
  hi,
  origin,
}));

// Mesma lógica de src/audio/samples/notes.ts (aceita 'Cs5', 'C#5' e 'Db3').
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToMidi(name) {
  const m = /^([A-G])(s|#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Nota inválida: ${name}`);
  const acc = m[2] === 's' || m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + acc;
}

const exists = async (p) => {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
};

const listings = new Map();
async function listNotes(folder) {
  if (listings.has(folder)) return listings.get(folder);
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/samples/${folder}`, {
    headers: process.env.GITHUB_TOKEN
      ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {},
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} ao listar ${folder}`);
  const names = (await res.json()).map((f) => f.name);
  // Só ficheiros "<Nota>.mp3" (fica de fora, por exemplo, "F2 v2.mp3").
  const notes = names
    .map((n) => /^([A-G]s?-?\d)\.mp3$/.exec(n)?.[1])
    .filter(Boolean)
    .map((name) => ({ name, midi: noteToMidi(name) }))
    .sort((a, b) => a.midi - b.midi);
  listings.set(folder, notes);
  return notes;
}

// As notas disponíveis no registo, reduzidas a `count`, com as duas pontas e o maior intervalo
// entre vizinhas o mais pequeno possível (em empate, intervalos mais regulares).
function pickNotes(available, lo, hi, count) {
  const inRange = available.filter((n) => n.midi >= lo && n.midi <= hi);
  const n = inRange.length;
  if (n <= count) return inRange;
  const better = (a, b) => !b || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  // best[k][i]: [maior intervalo, soma dos quadrados, anterior] com k+1 notas, a última em i.
  const best = Array.from({ length: count }, () => new Array(n).fill(null));
  best[0][0] = [0, 0, -1];
  for (let k = 1; k < count; k++) {
    for (let i = 1; i < n; i++) {
      for (let j = 0; j < i; j++) {
        const prev = best[k - 1][j];
        if (!prev) continue;
        const gap = inRange[i].midi - inRange[j].midi;
        const cand = [Math.max(prev[0], gap), prev[1] + gap * gap, j];
        if (better(cand, best[k][i])) best[k][i] = cand;
      }
    }
  }
  const chosen = [];
  for (let k = count - 1, i = n - 1; k >= 0; i = best[k][i][2], k--) chosen.unshift(inRange[i]);
  return chosen;
}

// Número de notas por omissão: uma a cada ~5 semitons no registo, entre 6 e 8.
const defaultCount = (lo, hi) =>
  Math.min(MAX_NOTES, Math.max(MIN_NOTES, Math.round((hi - lo) / 5) + 1));

// Descarrega um ficheiro da biblioteca (com cache); devolve null se não existir.
async function download(folder, file) {
  const path = join(cache, folder, file);
  if (!(await exists(path))) {
    const res = await fetch(`${RAW}/${folder}/${encodeURIComponent(file)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} ao descarregar ${folder}/${file}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, new Uint8Array(await res.arrayBuffer()));
  }
  return new Uint8Array(await readFile(path));
}

// WAV PCM (8/16/24/32 bits) ou float de 32 bits, convertido para mono.
function decodeWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('WAV inválido');
  let fmt = null;
  for (let o = 12; o + 8 <= bytes.length;) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = {
        format: v.getUint16(o + 8, true),
        channels: v.getUint16(o + 10, true),
        sampleRate: v.getUint32(o + 12, true),
        bits: v.getUint16(o + 22, true),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV sem "fmt "');
      const { format, channels, sampleRate, bits } = fmt;
      const bps = bits / 8;
      const frames = Math.floor(Math.min(size, bytes.length - o - 8) / (bps * channels));
      const read =
        format === 3 && bits === 32
          ? (p) => v.getFloat32(p, true)
          : bits === 8
            ? (p) => (v.getUint8(p) - 128) / 128
            : bits === 16
              ? (p) => v.getInt16(p, true) / 0x8000
              : bits === 24
                ? (p) =>
                    (v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16)) / 0x800000
                : bits === 32
                  ? (p) => v.getInt32(p, true) / 0x80000000
                  : null;
      if (!read || (format !== 1 && format !== 3 && format !== 0xfffe)) {
        throw new Error(`WAV não suportado (formato ${format}, ${bits} bits)`);
      }
      const data = new Float32Array(frames);
      for (let i = 0, p = o + 8; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++, p += bps) sum += read(p);
        data[i] = sum / channels;
      }
      return { data, sampleRate };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error('WAV sem "data"');
}

let decoder;
async function decodeMp3(bytes) {
  if (!decoder) {
    decoder = new MPEGDecoder();
    await decoder.ready;
  } else {
    await decoder.reset();
  }
  const { channelData, samplesDecoded, sampleRate } = decoder.decode(bytes);
  const mono = new Float32Array(samplesDecoded);
  for (const ch of channelData) {
    for (let i = 0; i < samplesDecoded; i++) mono[i] += ch[i] / channelData.length;
  }
  return { data: mono, sampleRate };
}

// Prefere o WAV original: evita uma segunda compressão com perdas e o silêncio (~27 ms) que o
// codificador MP3 da biblioteca pôs no início de cada nota. Se não houver WAV, usa o MP3.
async function loadSource(folder, name) {
  const wav = await download(folder, `${name}.wav`);
  if (wav) return decodeWav(wav);
  const mp3 = await download(folder, `${name}.mp3`);
  if (!mp3) throw new Error(`${folder}/${name}: sem WAV nem MP3`);
  return decodeMp3(mp3);
}

function resample(data, from, to) {
  if (from === to) return data;
  const n = Math.floor((data.length * to) / from);
  const outData = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * from) / to;
    const j = Math.floor(x);
    const f = x - j;
    outData[i] = data[j] * (1 - f) + (data[Math.min(j + 1, data.length - 1)] ?? 0) * f;
  }
  return outData;
}

// Corta para durMax sem mexer no ataque; fade-in de 3 ms e fade-out linear de 150 ms.
function trim(data, durMax) {
  const n = Math.min(data.length, Math.round(durMax * RATE));
  const res = data.slice(0, n);
  const fin = Math.min(n, Math.round(FADE_IN * RATE));
  for (let i = 0; i < fin; i++) res[i] *= i / fin;
  const fout = Math.min(n, Math.round(FADE_OUT * RATE));
  for (let i = 0; i < fout; i++) res[n - 1 - i] *= i / fout;
  return res;
}

function rms(data, seconds) {
  const n = Math.min(data.length, Math.round(seconds * RATE));
  let s = 0;
  for (let i = 0; i < n; i++) s += data[i] * data[i];
  return Math.sqrt(s / Math.max(1, n));
}

function encode(data, kbps) {
  const enc = new Mp3Encoder(1, RATE, kbps);
  const pcm = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const chunks = [];
  const BLOCK = 1152 * 16;
  for (let i = 0; i < pcm.length; i += BLOCK)
    chunks.push(enc.encodeBuffer(pcm.subarray(i, i + BLOCK)));
  chunks.push(enc.flush());
  const bytes = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    bytes.set(c, o);
    o += c.length;
  }
  return bytes;
}

// Prepara um instrumento com `count` notas; as notas descodificadas ficam em memória.
const pcmCache = new Map();
async function prepare(inst, available, count, kbps) {
  const notes = pickNotes(available, noteToMidi(inst.lo), noteToMidi(inst.hi), count);
  const files = [];
  for (const n of notes) {
    const key = `${inst.folder}/${n.name}`;
    if (!pcmCache.has(key)) {
      const { data, sampleRate } = await loadSource(inst.folder, n.name);
      const pcm = trim(resample(data, sampleRate, RATE), inst.durMax);
      pcmCache.set(key, { pcm, rms: rms(pcm, RMS_WINDOW) });
    }
    const { pcm, rms: r } = pcmCache.get(key);
    files.push({ name: n.name, duration: pcm.length / RATE, rms: r, mp3: encode(pcm, kbps) });
  }
  const size = files.reduce((a, f) => a + f.mp3.length, 0);
  return { inst, count, kbps, files, size };
}

// Tenta 96 kbps; se passar de 250 KiB, 80 kbps; se ainda passar, menos notas (mínimo 6).
async function fit(inst, available, count, rates = [96, 80]) {
  for (let c = count; c >= MIN_NOTES; c--) {
    for (const kbps of rates) {
      const r = await prepare(inst, available, c, kbps);
      if (r.size <= MAX_INSTRUMENT || (c === MIN_NOTES && kbps === 80)) return r;
    }
  }
}

const results = [];
for (const inst of INSTRUMENTS) {
  const available = await listNotes(inst.folder);
  const lo = noteToMidi(inst.lo);
  const hi = noteToMidi(inst.hi);
  if (available.filter((n) => n.midi >= lo && n.midi <= hi).length === 0) {
    throw new Error(`${inst.id}: nenhuma nota em ${inst.lo}–${inst.hi}`);
  }
  results.push(await fit(inst, available, defaultCount(lo, hi)));
}

// Se o total passar de 4 MiB (com margem para o manifest e os créditos), o maior instrumento que
// ainda pode encolher desce para 80 kbps ou, se já lá estiver, perde uma nota (mínimo 6).
const BUDGET = MAX_TOTAL - 16 * 1024;
let total = results.reduce((a, r) => a + r.size, 0);
while (total > BUDGET) {
  const candidates = results.filter((r) => r.kbps > 80 || r.files.length > MIN_NOTES);
  if (candidates.length === 0) break;
  const big = candidates.reduce((a, b) => (b.size > a.size ? b : a));
  const i = results.indexOf(big);
  const available = await listNotes(big.inst.folder);
  results[i] =
    big.kbps > 80
      ? await fit(big.inst, available, big.files.length, [80])
      : await fit(big.inst, available, big.files.length - 1, [80]);
  total = results.reduce((a, r) => a + r.size, 0);
}

await rm(out, { recursive: true, force: true });
const manifest = { version: 1, instruments: {} };
for (const r of [...results].sort((a, b) => a.inst.id.localeCompare(b.inst.id))) {
  await mkdir(join(out, r.inst.id), { recursive: true });
  const notes = {};
  for (const f of r.files) {
    await writeFile(join(out, r.inst.id, `${f.name}.mp3`), f.mp3);
    notes[f.name] = Math.round(f.duration * 1000) / 1000;
  }
  const meanGain = r.files.reduce((a, f) => a + TARGET_RMS / f.rms, 0) / r.files.length;
  r.gain = Math.round(Math.min(4, Math.max(0.25, meanGain)) * 1000) / 1000;
  manifest.instruments[r.inst.id] = {
    source: r.inst.folder,
    origin: r.inst.origin,
    notes,
    gain: r.gain,
  };
}
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(join(out, 'manifest.json'), manifestText);

const originLines = [...results]
  .sort((a, b) => a.inst.id.localeCompare(b.inst.id))
  .map((r) => `| \`${r.inst.id}\` | ${r.inst.folder} | ${r.inst.origin} |`)
  .join('\n');

const credits = `# Créditos dos sons

As gravações dos instrumentos acústicos vêm da biblioteca
[tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments), de Nicholas Brosowsky,
com as amostras sob a licença
[Creative Commons Atribuição 3.0 (CC-BY 3.0)](https://creativecommons.org/licenses/by/3.0/).

Alterações: amostras cortadas, convertidas para mono e comprimidas (MP3 mono, 44,1 kHz), com
*fade-in* de 3 ms e *fade-out* de 150 ms. Só uma parte das notas de cada instrumento é usada.

## Origem de cada instrumento

| Instrumento | Pasta da biblioteca | Origem das gravações |
|---|---|---|
${originLines}

- **VSCO 2 Community Edition** — Versilian Studios, domínio público (CC0):
  <https://vis.versilstudios.net/vsco-community.html>
- **Karoryfer Samples** — bibliotecas gratuitas publicadas em domínio público (CC0):
  <https://www.karoryfer.com/karoryfer-samples>
- **University of Iowa Musical Instrument Samples** — "may be downloaded and used for any
  projects, without restrictions": <https://theremin.music.uiowa.edu/MIS.html>
- **Freesound** — violoncelo: pack 12408 "Real Cello Notes", de
  [flcellogrl](https://freesound.org/people/flcellogrl/),
  <https://freesound.org/people/flcellogrl/packs/12408/>, todos os sons sob
  [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), a licença com que o pack foi
  publicado e incluído na biblioteca; a página do Freesound mostra hoje
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Ambas só pedem a atribuição.

As amostras são geradas por \`scripts/prepare-samples.mjs\` (\`npm run prepare-samples\`).
`;
await writeFile(join(out, 'CREDITS.md'), credits);
// O limite total conta tudo o que fica em public/samples/.
total += Buffer.byteLength(manifestText) + Buffer.byteLength(credits);

console.log('id          notas  kbps    KiB   gain');
for (const r of results) {
  console.log(
    `${r.inst.id.padEnd(11)} ${String(r.files.length).padStart(5)}  ${String(r.kbps).padStart(4)}  ${(r.size / 1024).toFixed(1).padStart(5)}  ${r.gain.toFixed(3)}`,
  );
}
console.log(`total: ${(total / 1024).toFixed(1)} KiB`);

// Verificação: cada MP3 escrito descodifica, tem a duração do manifest (±5%) e não é silêncio.
const bad = [];
for (const [id, inst] of Object.entries(manifest.instruments)) {
  for (const [name, duration] of Object.entries(inst.notes)) {
    const { data, sampleRate } = await decodeMp3(await readFile(join(out, id, `${name}.mp3`)));
    const got = data.length / sampleRate;
    let sum = 0;
    for (const x of data) sum += x * x;
    const level = Math.sqrt(sum / Math.max(1, data.length));
    if (Math.abs(got - duration) > duration * 0.05 || !(level > 0.01)) {
      bad.push(
        `${id}/${name}: ${got.toFixed(3)} s (esperado ${duration} s), RMS ${level.toFixed(4)}`,
      );
    }
  }
}
decoder?.free();
for (const b of bad) console.error(`Amostra inválida: ${b}`);

const over = results.filter((r) => r.size > MAX_INSTRUMENT);
if (bad.length > 0 || over.length > 0 || total > MAX_TOTAL) {
  for (const r of over)
    console.error(`${r.inst.id} passa de 250 KiB (${(r.size / 1024).toFixed(1)} KiB)`);
  if (total > MAX_TOTAL) console.error(`O total passa de 4 MiB (${(total / 1024).toFixed(1)} KiB)`);
  process.exit(1);
}
