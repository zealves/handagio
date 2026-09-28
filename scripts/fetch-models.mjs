// Descarrega os modelos do MediaPipe e copia os ficheiros WASM para public/mediapipe/,
// para a app funcionar sem CDNs. Ficheiros já existentes não são descarregados de novo.
import { copyFile, mkdir, stat, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'mediapipe');
const wasmOut = join(out, 'wasm');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');

const MODELS = {
  'hand_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
  'face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
};

const exists = async (p) => {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
};

await mkdir(wasmOut, { recursive: true });

for (const f of await readdir(wasmSrc)) {
  await copyFile(join(wasmSrc, f), join(wasmOut, f));
}
console.log(`WASM copiado para ${wasmOut}`);

for (const [name, url] of Object.entries(MODELS)) {
  const dest = join(out, name);
  if (await exists(dest)) {
    console.log(`${name} já existe, a saltar.`);
    continue;
  }
  console.log(`A descarregar ${name}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falhou ${url}: ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`${name} guardado.`);
}
