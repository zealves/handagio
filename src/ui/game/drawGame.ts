// Pista do modo de jogo (canvas, a 60 fps): faixas em perspetiva, notas a descer, linha de
// impacto, pontuação, combo e contagem. Lê só o `GameRun` e o tempo de áudio.
import { NOTE_GOOD, NOTE_MISS, NOTE_PENDING, NOTE_PERFECT } from '../../game/judge';
import type { GameRun } from '../../game/run';
import { FINGER_COLORS } from '../theme';

export interface GameLabels {
  go: string;
  judge: { perfect: string; good: string; miss: string };
  combo: (n: number) => string;
  /** Nome curto do dedo de cada faixa (só aparece com faixas largas). */
  lanes: string[];
}

/** Topo da pista e linha de impacto (fração da altura). */
const TOP_Y = 0.1;
const HIT_Y = 0.82;
/** Largura da pista em baixo (fração da largura, com máximo em px) e no topo (fração da de baixo). */
const BOTTOM_W = 0.92;
const MAX_BOTTOM_W = 760;
const TOP_RATIO = 0.3;
/** Durações (s) do clarão de um acerto, do texto do juízo e do desvanecer de um falhado. */
const FLASH_S = 0.18;
const JUDGE_S = 0.6;
const MISS_FADE_S = 0.5;
/** Largura mínima (px) de uma faixa para escrever o nome do dedo. */
const LABEL_MIN_LANE = 56;
const MISS_COLOR = '#ff5c7a';

/** Profundidade 0 (topo) … 1 (linha) de uma nota que chega daqui a `dt` s, com perspetiva. */
export function depth(dt: number, lead: number): number {
  const p = 1 - dt / lead;
  return p * p * 0.55 + p * 0.45;
}

export function drawGame(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  run: GameRun,
  now: number,
  fingers: readonly number[],
  labels: GameLabels,
): void {
  const n = run.chart.lanes;
  const cx = w / 2;
  const top = h * TOP_Y;
  const hit = h * HIT_Y;
  const wb = Math.min(w * BOTTOM_W, MAX_BOTTOM_W);
  const wt = wb * TOP_RATIO;
  const widthAt = (e: number) => wt + (wb - wt) * e;
  const yAt = (e: number) => top + (hit - top) * e;
  const laneX = (lane: number, e: number) => cx - widthAt(e) / 2 + (widthAt(e) * (lane + 0.5)) / n;
  const color = (lane: number) => FINGER_COLORS[fingers[lane]] ?? '#fff';
  const { lead, stepDur } = run.timing;
  const eEnd = 1.12;

  // pista
  g.save();
  g.beginPath();
  g.moveTo(cx - wt / 2, top);
  g.lineTo(cx + wt / 2, top);
  g.lineTo(cx + widthAt(eEnd) / 2, yAt(eEnd));
  g.lineTo(cx - widthAt(eEnd) / 2, yAt(eEnd));
  g.closePath();
  g.fillStyle = 'rgba(8, 14, 36, 0.55)';
  g.fill();
  for (let l = 1; l < n; l++) {
    const xt = cx - wt / 2 + (wt * l) / n;
    const xb = cx - widthAt(eEnd) / 2 + (widthAt(eEnd) * l) / n;
    g.beginPath();
    g.moveTo(xt, top);
    g.lineTo(xb, yAt(eEnd));
    // a divisória do meio separa as duas mãos
    g.strokeStyle = l === n / 2 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
    g.lineWidth = l === n / 2 ? 2 : 1;
    g.stroke();
  }
  g.restore();

  // notas
  for (let k = 0; k < run.times.length; k++) {
    const dt = run.times[k] - now;
    if (dt > lead) break;
    const st = run.judge.state[k];
    if (st === NOTE_PERFECT || st === NOTE_GOOD) continue;
    let alpha = 1;
    if (st === NOTE_MISS) {
      alpha = 1 - (now - run.judgedAt[k]) / MISS_FADE_S;
      if (alpha <= 0) continue;
    } else if (st === NOTE_PENDING && dt < -0.4) continue;
    const e = depth(dt, lead);
    if (e < 0) continue;
    const lane = run.chart.notes[k].lane;
    const lw = widthAt(e) / n;
    const nw = lw * 0.72;
    const nh = Math.max(6, nw * 0.38);
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = st === NOTE_MISS ? MISS_COLOR : color(lane);
    g.shadowColor = g.fillStyle;
    g.shadowBlur = 14 * e;
    g.beginPath();
    g.roundRect(laneX(lane, e) - nw / 2, yAt(e) - nh / 2, nw, nh, nh / 2);
    g.fill();
    g.restore();
  }

  // linha de impacto: um alvo por faixa, que acende num acerto
  const lw1 = widthAt(1) / n;
  const r = Math.min(lw1 * 0.32, 30);
  for (let l = 0; l < n; l++) {
    const x = laneX(l, 1);
    const flash = Math.max(0, 1 - (now - run.hitAt[l]) / FLASH_S);
    g.save();
    g.strokeStyle = color(l);
    g.lineWidth = 3;
    g.shadowColor = color(l);
    g.shadowBlur = 8 + 20 * flash;
    g.beginPath();
    g.arc(x, hit, r * (1 + 0.25 * flash), 0, Math.PI * 2);
    g.stroke();
    if (flash > 0) {
      g.globalAlpha = flash;
      g.fillStyle = color(l);
      g.fill();
    }
    g.restore();
    if (lw1 >= LABEL_MIN_LANE && labels.lanes[l]) {
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.font = '500 12px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(labels.lanes[l], x, hit + r + 8);
    }
  }

  // pontuação, multiplicador e combo
  const sc = run.score;
  g.save();
  g.textBaseline = 'top';
  g.textAlign = 'left';
  g.fillStyle = '#fff';
  g.font = '700 26px system-ui, sans-serif';
  g.fillText(String(sc.points), 16, 14);
  g.font = '600 15px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.8)';
  const mult = sc.multiplier > 1 ? `×${sc.multiplier}  ` : '';
  if (sc.combo > 1 || mult) g.fillText(mult + labels.combo(sc.combo), 16, 46);
  g.restore();

  // progresso
  const frac = Math.min(1, Math.max(0, (now - run.start) / (run.end - run.start)));
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(0, 0, w, 3);
  g.fillStyle = 'rgba(53,224,255,0.85)';
  g.fillRect(0, 0, w * frac, 3);

  // juízo e contagem, ao centro
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (run.last && now - run.last.at < JUDGE_S) {
    const a = 1 - (now - run.last.at) / JUDGE_S;
    g.globalAlpha = a;
    g.fillStyle = run.last.kind === 'miss' ? MISS_COLOR : '#fff';
    g.font = '700 24px system-ui, sans-serif';
    g.fillText(labels.judge[run.last.kind], cx, hit - r - 34 - 10 * (1 - a));
  }
  g.globalAlpha = 1;
  const beat = 4 * stepDur;
  const toStart = run.start - now;
  const count = Math.ceil(toStart / beat);
  const big =
    toStart > 0 ? (count <= 3 ? String(count) : '') : now - run.start < 0.6 ? labels.go : '';
  if (big) {
    g.fillStyle = '#fff';
    g.font = '800 64px system-ui, sans-serif';
    g.shadowColor = 'rgba(53,224,255,0.9)';
    g.shadowBlur = 24;
    g.fillText(big, cx, h * 0.42);
  }
  g.restore();
}
