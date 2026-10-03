// Pista do modo de jogo (canvas, a 60 fps): faixas em perspetiva, notas a descer, linha de
// impacto, pontuação, combo e contagem. Lê só o `GameRun` e o tempo de áudio.
import { NOTE_GOOD, NOTE_MISS, NOTE_PENDING, NOTE_PERFECT } from '../../game/judge';
import type { GameRun } from '../../game/run';
import { FINGER_COLORS, NEON } from '../theme';

export interface GameLabels {
  go: string;
  judge: {
    perfect: string;
    good: string;
    miss: string;
    early: string;
    late: string;
    wrong: string;
  };
  combo: (n: number) => string;
  /** Nome curto da mão e do dedo de cada faixa (só aparece com faixas largas). */
  lanes: string[];
  /** Barra da energia cheia, por câmara ("Abre a boca!") ou teclado ("Espaço!"). */
  powerReady: string;
  powerReadyKey: string;
  /** "×2", junto à pontuação enquanto a energia está ativa. */
  powerMult: string;
}

/** Topo da pista e linha de impacto (fração da altura). */
const TOP_Y = 0.1;
const HIT_Y = 0.82;
/** Largura da pista em baixo (fração da largura, com máximo em px) e no topo (fração da de baixo). */
const BOTTOM_W = 0.92;
const MAX_BOTTOM_W = 760;
const TOP_RATIO = 0.3;
/** Durações (s) do clarão de um acerto, do texto do juízo e do desvanecer de um falhado. */
const FLASH_S = 0.25;
const JUDGE_S = 0.6;
const MISS_FADE_S = 0.5;
/** Largura mínima (px) de uma faixa para escrever o nome do dedo. */
const LABEL_MIN_LANE = 56;
/**
 * Forma de uma nota (e do alvo na linha de impacto, à mesma profundidade): largura como fração
 * da faixa, altura como fração dessa largura (com um mínimo em px, para não desaparecer longe no
 * topo da pista).
 */
const NOTE_W_RATIO = 0.86;
const NOTE_H_RATIO = 0.38;
const NOTE_MIN_H = 10;
/** O alvo é maior que a nota: 1,2× a largura (sem passar 0,95× a faixa) e 1,4× a altura. */
const TARGET_W_FACTOR = 1.2;
const TARGET_H_FACTOR = 1.4;
const TARGET_MAX_LANE_FRAC = 0.95;
/** Quanto o alvo cresce no pico do clarão de um acerto (fração do seu próprio tamanho). */
const TARGET_FLASH_GROW = 0.25;
/** Cor de um falhado e de um toque errado ("Errado!"). */
const MISS_COLOR = '#ff5c7a';
/**
 * Profundidade máxima de uma nota falhada: sem isto, `depth` continua a avançar com `dt` e, com
 * atrasos típicos (~120 ms) e janelas curtas (Difícil), a nota já teria passado o fundo do canvas
 * quando é marcada como falhada, pelo que o desvanecer nunca se via. Ligeiramente a mais da linha
 * de impacto (1 = a linha), para o falhado se ver a apagar junto dela.
 */
const MISS_MAX_DEPTH = 1.04;

/** Cor da energia (Star Power), cheia ou ativa: dourada, em vez do ciano de sempre. */
const POWER_GOLD = '#ffd166';
/** Barra da energia: fina, vertical, à direita da pista, perto do fundo. */
const ENERGY_BAR_W = 10;
const ENERGY_BAR_H = 150;
const ENERGY_BAR_GAP = 20;
/** Período (s) do pulsar do texto "Abre a boca!"/"Espaço!" com a barra cheia. */
const POWER_PULSE_S = 1.1;

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
  keyMode: boolean,
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
  // `now` já vem congelado em pausa (`GameRun.viewNow`): a energia some com o resto da pista.
  const powerActive = run.powerActive(now);
  const powerFull = !powerActive && run.energy >= 1;

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

  // com a energia ativa, a pista ganha um contorno dourado (decisão 73)
  if (powerActive) {
    g.save();
    g.beginPath();
    g.moveTo(cx - wt / 2, top);
    g.lineTo(cx + wt / 2, top);
    g.lineTo(cx + widthAt(eEnd) / 2, yAt(eEnd));
    g.lineTo(cx - widthAt(eEnd) / 2, yAt(eEnd));
    g.closePath();
    g.strokeStyle = POWER_GOLD;
    g.lineWidth = 3;
    g.shadowColor = POWER_GOLD;
    g.shadowBlur = 24;
    g.stroke();
    g.restore();
  }

  // notas
  for (let k = 0; k < run.times.length; k++) {
    const dt = run.times[k] - now;
    if (dt > lead) break;
    const st = run.judge.state[k];
    if (st === NOTE_PERFECT || st === NOTE_GOOD) continue;
    let alpha = 1;
    if (st === NOTE_MISS) {
      // depois de uma retoma, `judgedAt` pode ficar no futuro (desloca-se com a ronda): durante
      // o compasso da contagem o falhado fica parado com a cor toda e só desvanece quando o
      // tempo real voltar a passar por ele
      const since = Math.max(0, now - run.judgedAt[k]);
      alpha = 1 - since / MISS_FADE_S;
      if (alpha <= 0) continue;
    } else if (st === NOTE_PENDING && dt < -0.4) continue;
    const e = st === NOTE_MISS ? Math.min(depth(dt, lead), MISS_MAX_DEPTH) : depth(dt, lead);
    if (e < 0) continue;
    const lane = run.chart.notes[k].lane;
    const lw = widthAt(e) / n;
    const nw = lw * NOTE_W_RATIO;
    const nh = Math.max(NOTE_MIN_H, nw * NOTE_H_RATIO);
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

  // linha de impacto: um alvo-pílula por faixa, com a forma das notas (maior, para a área de
  // toque se ver bem), que acende num acerto
  const lw1 = widthAt(1) / n;
  const nw1 = lw1 * NOTE_W_RATIO;
  const nh1 = Math.max(NOTE_MIN_H, nw1 * NOTE_H_RATIO);
  const targetW = Math.min(TARGET_W_FACTOR * nw1, lw1 * TARGET_MAX_LANE_FRAC);
  const targetH = TARGET_H_FACTOR * nh1;
  for (let l = 0; l < n; l++) {
    const x = laneX(l, 1);
    // guarda contra `hitAt` no futuro (retoma): sem isto o clarão acenderia ao máximo durante a
    // contagem, para um acerto que já lá estava antes da pausa
    const sinceHit = now - run.hitAt[l];
    const flash = sinceHit >= 0 ? Math.max(0, 1 - sinceHit / FLASH_S) : 0;
    const scale = 1 + TARGET_FLASH_GROW * flash;
    const tw = targetW * scale;
    const th = targetH * scale;
    g.save();
    g.strokeStyle = color(l);
    g.lineWidth = 3;
    // com a energia ativa o brilho dos alvos fica dourado (a cor do dedo continua a identificá-los)
    g.shadowColor = powerActive ? POWER_GOLD : color(l);
    g.shadowBlur = (powerActive ? 16 : 8) + 20 * flash;
    g.beginPath();
    g.roundRect(x - tw / 2, hit - th / 2, tw, th, th / 2);
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
      g.fillText(labels.lanes[l], x, hit + targetH / 2 + 8);
    }
  }

  // pontuação, multiplicador e combo
  const sc = run.score;
  g.save();
  g.textBaseline = 'top';
  g.textAlign = 'left';
  g.fillStyle = '#fff';
  g.font = '700 26px system-ui, sans-serif';
  const pointsText = String(sc.points);
  g.fillText(pointsText, 16, 14);
  if (powerActive) {
    const pw = g.measureText(pointsText).width;
    g.fillStyle = POWER_GOLD;
    g.font = '700 18px system-ui, sans-serif';
    g.fillText(labels.powerMult, 16 + pw + 8, 18);
  }
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

  // barra da energia (Star Power): vertical, fina, à direita da pista, perto do fundo
  const barX = cx + widthAt(1) / 2 + ENERGY_BAR_GAP + ENERGY_BAR_W / 2;
  const barBottom = hit;
  const barTop = barBottom - ENERGY_BAR_H;
  const energyFrac = powerActive ? run.powerLeft(now) : Math.min(1, run.energy);
  const energyColor = powerActive || powerFull ? POWER_GOLD : NEON.cyan;
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.roundRect(barX - ENERGY_BAR_W / 2, barTop, ENERGY_BAR_W, ENERGY_BAR_H, ENERGY_BAR_W / 2);
  g.fill();
  const fillH = ENERGY_BAR_H * energyFrac;
  if (fillH > 0) {
    g.fillStyle = energyColor;
    g.shadowColor = energyColor;
    g.shadowBlur = 10;
    g.beginPath();
    g.roundRect(barX - ENERGY_BAR_W / 2, barBottom - fillH, ENERGY_BAR_W, fillH, ENERGY_BAR_W / 2);
    g.fill();
  }
  g.restore();
  // barra cheia, energia ainda por ativar: o convite a pulsar ("Abre a boca!"/"Espaço!")
  if (powerFull) {
    const pulse = 0.55 + 0.45 * Math.sin((now / POWER_PULSE_S) * Math.PI * 2);
    g.save();
    g.globalAlpha = pulse;
    g.fillStyle = POWER_GOLD;
    g.font = '700 15px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillText(keyMode ? labels.powerReadyKey : labels.powerReady, barX, barTop - 8);
    g.restore();
  }

  // juízo e contagem, ao centro
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // guarda contra `last.at` no futuro (retoma): o juízo de antes da pausa só volta a aparecer
  // quando o relógio realmente lá chegar, nunca ao máximo logo na contagem
  const sinceJudge = run.last ? now - run.last.at : -1;
  if (run.last && sinceJudge >= 0 && sinceJudge < JUDGE_S) {
    const a = 1 - sinceJudge / JUDGE_S;
    const { kind } = run.last;
    g.globalAlpha = a;
    // "Cedo!"/"Tarde!" ficam a branco, como um acerto; só o falhado e o toque errado ficam a
    // vermelho (não há mais nenhuma cor de juízo no jogo)
    g.fillStyle = kind === 'miss' || kind === 'wrong' ? MISS_COLOR : '#fff';
    g.font = '700 24px system-ui, sans-serif';
    const judgeText = labels.judge[kind];
    g.fillText(judgeText, cx, hit - targetH / 2 - 34 - 10 * (1 - a));
  }
  g.globalAlpha = 1;
  const beat = 4 * stepDur;
  const toStart = run.countTo - now;
  const count = Math.ceil(toStart / beat);
  const big =
    toStart > 0 ? (count <= 3 ? String(count) : '') : now - run.countTo < 0.6 ? labels.go : '';
  if (big) {
    g.fillStyle = '#fff';
    g.font = '800 64px system-ui, sans-serif';
    g.shadowColor = 'rgba(53,224,255,0.9)';
    g.shadowBlur = 24;
    g.fillText(big, cx, h * 0.42);
  }
  g.restore();
}
