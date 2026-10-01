// Depois do build: o chunk principal não pode trazer textos da interface (vão nos chunks das
// línguas, decisão 66). Procura algumas frases de cada língua; os nomes dos dados (instrumentos,
// escalas…) ficam de fora, porque o português deriva deles e vivem no código do áudio.
import { readdirSync, readFileSync } from 'node:fs';

const MARKERS = [
  'Começar',
  'Sons guardados',
  'Definições',
  'Mostra as duas mãos',
  'Calibração feita',
  'Não consegui',
  'Câmara ',
  'O acesso à câmara',
  'Gravações desta sessão',
  'Saved sounds',
  'No camera?',
];

const dir = 'dist/assets';
const main = readdirSync(dir).filter((f) => /^index-.*\.js$/.test(f));
if (!main.length)
  throw new Error('check-bundle-texts: sem dist/assets/index-*.js (falta o build?)');
const found = [];
for (const f of main) {
  const src = readFileSync(`${dir}/${f}`, 'utf8');
  for (const m of MARKERS) if (src.includes(m)) found.push(`${f}: "${m}"`);
}
if (found.length) {
  console.error('Textos da interface no chunk principal (devem ir para src/i18n/locales):');
  for (const x of found) console.error(`  ${x}`);
  process.exit(1);
}
console.log(`check-bundle-texts: ${main.join(', ')} sem textos da interface.`);
