// Desenho do overlay do palco: esqueleto das mãos em néon (ciano → magenta), anéis nas pontas dos
// dedos, ondas de disparo com o nome da nota, colunas do modo movimento e contorno dos lábios.
import { t } from '../../i18n';
import { getState } from '../../state/store';
import { live } from '../../state/live';
import { MOUTH_FX } from '../../state/types';
import { activeScreenOrder, isActive } from '../../vision/fingerMap';
import { FINGER_COLORS, NEON } from '../theme';

const CONN: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];
export const LIP_IDS = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
];

export function drawOverlay(g: CanvasRenderingContext2D, W: number, H: number, reduced: boolean) {
  const now = performance.now();
  const s = getState();
  const sc = W / 960;
  const glow = reduced ? 4 : 14;
  g.clearRect(0, 0, W, H);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Com o jogo a decorrer ou em pausa, só os dedos com faixa (`game.fingers`) ficam em
  // destaque; os outros e o esqueleto esmorecem, para as mãos não tirarem a atenção da pista.
  const inGame = s.game?.phase === 'playing' || s.game?.phase === 'paused';
  const playingFingers = inGame ? new Set(s.game!.fingers) : null;

  // Modo movimento: uma coluna por dedo.
  if (s.engine === 'motion') {
    const order = activeScreenOrder(s.thumbs);
    const zw = W / order.length;
    order.forEach((i, z) => {
      const c = FINGER_COLORS[i];
      g.fillStyle = c + '1a';
      g.fillRect(zw * z + 2, 0, zw - 4, H * 0.66);
      g.fillStyle = c + 'cc';
      g.fillRect(zw * z + 2, H * 0.66 - live.fingers[i].curl * H * 0.66, zw - 4, 5 * sc);
    });
  }

  // Esqueleto.
  if (s.engine === 'hands' && now - live.handsT < 500) {
    for (const lm of live.hands) {
      let minX = 1;
      let maxX = 0;
      for (const p of lm) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
      }
      const grad = g.createLinearGradient(minX * W, 0, Math.max(maxX, minX + 0.01) * W, 0);
      grad.addColorStop(0, NEON.cyan);
      grad.addColorStop(0.5, NEON.violet);
      grad.addColorStop(1, NEON.magenta);
      g.strokeStyle = grad;
      g.lineWidth = Math.max(2.5, W / 300);
      g.shadowColor = NEON.cyan;
      g.shadowBlur = glow * sc;
      g.globalAlpha = inGame ? 0.4 : 1;
      g.beginPath();
      for (const [a, b] of CONN) {
        g.moveTo(lm[a].x * W, lm[a].y * H);
        g.lineTo(lm[b].x * W, lm[b].y * H);
      }
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(232,238,255,.85)';
      for (const p of lm) {
        g.beginPath();
        g.arc(p.x * W, p.y * H, 2.6 * sc, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  }

  // Modo teclado.
  if (s.engine === 'keyboard') {
    g.fillStyle = 'rgba(232,238,255,.85)';
    g.font = `500 ${Math.round(W / 42)}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText(t().start.overlayKeys(s.thumbs), W / 2, H / 2);
  }

  // Lábios.
  if (live.lips && now - live.lipsT < 600) {
    const lm = live.lips;
    const a = live.mouth;
    g.beginPath();
    LIP_IDS.forEach((id, k) => {
      const x = lm[id].x * W;
      const y = lm[id].y * H;
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
    g.strokeStyle = NEON.magenta;
    g.lineWidth = Math.max(2, W / 400);
    g.shadowColor = NEON.magenta;
    g.shadowBlur = glow * sc * (0.4 + a);
    g.globalAlpha = 0.5 + a * 0.5;
    g.stroke();
    g.shadowBlur = 0;
    if (a > 0.1) {
      g.fillStyle = `rgba(255,79,216,${a * 0.3})`;
      g.fill();
      g.globalAlpha = 1;
      g.font = `600 ${Math.round(18 * sc)}px Inter, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.fillText(
        MOUTH_FX.find((m) => m.id === s.mouthFx)?.label ?? '',
        lm[17].x * W,
        lm[17].y * H + 30 * sc,
      );
    }
    g.globalAlpha = 1;
  }

  // Anéis nas pontas dos dedos: com o jogo a decorrer ou em pausa, só os dedos com faixa ficam
  // em destaque (pílula maior, com a forma da nota); os outros ficam com o anel pequeno e
  // cinzento de sempre, bem apagado.
  for (let i = 0; i < 10; i++) {
    const f = live.fingers[i];
    if (!f.tip || !isActive(i, s.thumbs)) continue;
    const playing = !playingFingers || playingFingers.has(i);
    const x = f.tip.x * W;
    const y = f.tip.y * H;
    const r = (10 + f.curl * 14) * sc;
    if (!playing) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.globalAlpha = 0.25;
      g.lineWidth = 2 * sc;
      g.strokeStyle = '#8a93a6';
      g.stroke();
      g.globalAlpha = 1;
      continue;
    }
    const fx = live.fx[i];
    const c = FINGER_COLORS[i];
    g.shadowColor = c;
    g.shadowBlur = glow * sc * (0.6 + f.curl);
    g.beginPath();
    if (inGame) {
      // pílula com a forma da nota, ~1,3× o anel de sempre, que enche com a dobra do dedo
      const pw = r * 2 * 1.3;
      const ph = pw * 0.44;
      g.roundRect(x - pw / 2, y - ph / 2, pw, ph, ph / 2);
    } else {
      g.arc(x, y, r, 0, Math.PI * 2);
    }
    g.globalAlpha = 0.15 + 0.4 * f.curl;
    g.fillStyle = c;
    g.fill();
    g.globalAlpha = 0.55 + 0.45 * f.curl;
    g.lineWidth = 3 * sc;
    g.strokeStyle = c;
    g.stroke();
    g.shadowBlur = 0;
    if (fx.flash > 0) {
      g.beginPath();
      g.arc(x, y, r + (1 - fx.flash) * 50 * sc, 0, Math.PI * 2);
      g.lineWidth = 4 * fx.flash * sc;
      g.globalAlpha = fx.flash;
      g.stroke();
      if (fx.label) {
        g.font = `600 ${Math.round(20 * sc)}px Inter, system-ui, sans-serif`;
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.shadowColor = 'rgba(0,0,0,.6)';
        g.shadowBlur = 6 * sc;
        g.fillText(fx.label, x, y - r - 12 * sc);
        g.shadowBlur = 0;
      }
    }
    g.globalAlpha = 1;
  }
}
