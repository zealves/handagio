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
  /** Nome da barra da energia, ao lado dela enquanto não está pronta. */
  energy: string;
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

/**
 * Barra da energia: horizontal, por baixo da pontuação, com o nome (ou o convite, quando está
 * pronta) à direita. Já esteve vertical ao lado da pista, mas aí, vazia, parecia uma barra
 * cinzenta solta no meio do palco.
 */
const ENERGY_BAR_TOP = 66;
const ENERGY_BAR_H = 8;
const ENERGY_BAR_W_MAX = 110;
const ENERGY_BAR_W_MIN = 40;
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
  // o convite a abrir a boca só aparece quando a energia dá mesmo para ativar agora, não só com
  // a barra cheia (nunca na contagem de uma retoma nem na cauda depois da última nota); a barra
  // em si continua dourada com `powerFull`, sem precisar da música a tocar.
  const canActivate = run.canActivate(now);

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
    // todas iguais e ténues: a divisória mais grossa entre as duas mãos parecia uma barra
    // cinzenta solta ao meio da pista (as cores das faixas já dizem de que mão é cada uma)
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
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
    g.strokeStyle = NEON.gold;
    g.lineWidth = 3;
    g.shadowColor = NEON.gold;
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
    // com a energia ativa o brilho dos alvos fica dourado, mais forte (a cor do dedo continua a
    // identificá-los no traço)
    g.shadowColor = powerActive ? NEON.gold : color(l);
    g.shadowBlur = (powerActive ? 26 : 8) + 20 * flash;
    g.beginPath();
    g.roundRect(x - tw / 2, hit - th / 2, tw, th, th / 2);
    g.stroke();
    if (flash > 0) {
      g.globalAlpha = flash;
      g.fillStyle = color(l);
      g.fill();
    }
    g.restore();
    // além do brilho, um fino traço dourado por dentro do alvo: visível mesmo sem sombra (capturas)
    if (powerActive) {
      g.save();
      g.strokeStyle = NEON.gold;
      g.lineWidth = 1.5;
      g.beginPath();
      g.roundRect(
        x - tw / 2 + 3,
        hit - th / 2 + 3,
        Math.max(0, tw - 6),
        Math.max(0, th - 6),
        Math.max(0, th / 2 - 3),
      );
      g.stroke();
      g.restore();
    }
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
    g.fillStyle = NEON.gold;
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

  // barra da energia (Star Power): horizontal, por baixo da pontuação (`ENERGY_BAR_TOP`), cheia
  // da esquerda para a direita; à direita, o nome ("Energia") ou, pronta a ativar, o convite a
  // pulsar ("Abre a boca!"/"Espaço!"), sempre medido para nunca sair do canvas
  const promptText = keyMode ? labels.powerReadyKey : labels.powerReady;
  g.font = '700 15px system-ui, sans-serif';
  const promptW = g.measureText(promptText).width;
  const barW = Math.max(ENERGY_BAR_W_MIN, Math.min(ENERGY_BAR_W_MAX, w - 32 - promptW - 12));
  const barLeft = 16;
  const barTop = ENERGY_BAR_TOP;
  const energyFrac = powerActive ? run.powerLeft(now) : Math.min(1, run.energy);
  const energyColor = powerActive || powerFull ? NEON.gold : NEON.cyan;
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.roundRect(barLeft, barTop, barW, ENERGY_BAR_H, ENERGY_BAR_H / 2);
  g.fill();
  const fillW = barW * energyFrac;
  if (fillW > 0) {
    g.fillStyle = energyColor;
    g.shadowColor = energyColor;
    g.shadowBlur = 8;
    g.beginPath();
    g.roundRect(barLeft, barTop, fillW, ENERGY_BAR_H, ENERGY_BAR_H / 2);
    g.fill();
  }
  g.restore();
  g.save();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  if (canActivate) {
    g.globalAlpha = 0.55 + 0.45 * Math.sin((now / POWER_PULSE_S) * Math.PI * 2);
    g.fillStyle = NEON.gold;
    g.font = '700 15px system-ui, sans-serif';
    g.fillText(promptText, barLeft + barW + 10, barTop + ENERGY_BAR_H / 2);
  } else if (!powerActive) {
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = '600 12px system-ui, sans-serif';
    g.fillText(labels.energy, barLeft + barW + 10, barTop + ENERGY_BAR_H / 2);
  }
  g.restore();

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
