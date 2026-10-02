// Seletor de dedos do modo de jogo: as duas mãos desenhadas em CSS (pílulas sobre uma palma),
// os atalhos (só esquerda, só direita, indicadores e médios) e o resumo "N faixas · Teclado: …".
import { FINGER_PRESETS, MIN_GAME_FINGERS, normalizeGameFingers } from '../../game/config';
import { useT } from '../../i18n';
import { fingerName } from '../../i18n/data';
import { KEYMAP } from '../../vision/fingerMap';
import { FINGER_COLORS } from '../theme';
import s from './FingerPicker.module.css';

/** Dedos de cada mão, pela ordem do ecrã: os mindinhos ficam por fora, os polegares ao centro,
    mais perto da outra mão (como as mãos aparecem no palco). */
const LEFT_HAND = [4, 3, 2, 1, 0];
const RIGHT_HAND = [5, 6, 7, 8, 9];
type PresetKey = keyof typeof FINGER_PRESETS;
const PRESET_KEYS = Object.keys(FINGER_PRESETS) as PresetKey[];

/**
 * Altura de cada dedo em px (resto da divisão por 5: 0 polegar … 4 mindinho), a partir das
 * percentagens da especificação (polegar 50%, indicador 82%, médio 90%, anelar 80%, mindinho
 * 60%) de um máximo de ~120 px. Em px e não em percentagem porque nenhum antepassado da pílula
 * tem altura explícita (uma `height: X%` não se resolveria contra uma altura indefinida).
 */
const MAX_FINGER_PX = 120;
const HEIGHT_PX: Record<number, number> = { 0: 50, 1: 82, 2: 90, 3: 80, 4: 60 };
for (const k of Object.keys(HEIGHT_PX))
  HEIGHT_PX[Number(k)] = (HEIGHT_PX[Number(k)] / 100) * MAX_FINGER_PX;

/**
 * Tecla de cada dedo (maiúscula), a partir do `KEYMAP` do modo teclado, exceto o dedo 9: esse
 * tem duas teclas, uma por teclado (`ç` no português, `;` no inglês), por isso vem de
 * `start.rightKeys` (que já distingue a língua) em vez do `KEYMAP` (ver `keyForFinger` abaixo).
 */
const KEY_FOR_FINGER: Partial<Record<number, string>> = {};
for (const [key, finger] of Object.entries(KEYMAP)) {
  if (finger === 9) continue;
  if (!(finger in KEY_FOR_FINGER)) KEY_FOR_FINGER[finger] = key.toUpperCase();
}

export interface FingerPickerProps {
  value: number[];
  onChange: (next: number[]) => void;
}

export function FingerPicker({ value, onChange }: FingerPickerProps) {
  const msgs = useT();
  const tr = msgs.game;
  const atMin = value.length === MIN_GAME_FINGERS;

  const toggle = (f: number) => {
    const next = value.includes(f) ? value.filter((x) => x !== f) : [...value, f];
    onChange(normalizeGameFingers(next) ?? value);
  };

  const presetActive = (k: PresetKey): boolean => {
    const p = FINGER_PRESETS[k];
    if (p.length !== value.length) return false;
    const chosen = new Set(value);
    return p.every((f) => chosen.has(f));
  };

  // o dedo 9 vem de `start.rightKeys` (o último, Ç/;), que já é o texto certo na língua atual;
  // os outros são teclas físicas que não mudam com a língua
  const keyForFinger = (f: number): string | undefined =>
    f === 9 ? msgs.start.rightKeys[3] : KEY_FOR_FINGER[f];
  const keys = value
    .map((f) => keyForFinger(f))
    .filter((k): k is string => !!k)
    .join(' ');

  return (
    <fieldset className={s.picker}>
      <legend className={s.legend}>{tr.fingers}</legend>
      <div className={s.hands}>
        {(
          [
            ['left', LEFT_HAND],
            ['right', RIGHT_HAND],
          ] as const
        ).map(([hand, fingers]) => (
          <div key={hand} className={s.hand}>
            <b className={s.handTitle}>{tr.hands[hand]}</b>
            <div className={s.graphic}>
              <div className={s.fingerRow}>
                {fingers.map((f) => {
                  const isThumb = f === 0 || f === 5;
                  const on = value.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      className={isThumb ? `${s.finger} ${s.thumb}` : s.finger}
                      style={{
                        ['--h' as string]: `${HEIGHT_PX[f % 5]}px`,
                        ['--c' as string]: FINGER_COLORS[f],
                      }}
                      aria-pressed={on}
                      aria-label={isThumb ? `${fingerName(f)} — ${tr.thumbsOff}` : fingerName(f)}
                      title={isThumb ? tr.thumbsOff : undefined}
                      disabled={isThumb || (atMin && on)}
                      onClick={() => toggle(f)}
                      data-testid={`game-finger-${f}`}
                    >
                      <span className={s.pill} />
                    </button>
                  );
                })}
              </div>
              <div className={s.palm} />
            </div>
          </div>
        ))}
      </div>
      <p className={s.thumbsNote}>{tr.thumbsOff}</p>
      {atMin && <p className={s.minFingers}>{tr.minFingers}</p>}
      <div className={s.presets}>
        {PRESET_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={s.preset}
            aria-pressed={presetActive(k)}
            onClick={() => onChange(normalizeGameFingers([...FINGER_PRESETS[k]]) ?? value)}
            data-testid={`game-preset-${k}`}
          >
            {tr.presets[k]}
          </button>
        ))}
      </div>
      <p className={s.lanesInfo} data-testid="game-lanes">
        {tr.lanes(value.length)} · {tr.keysHint(keys)}
      </p>
    </fieldset>
  );
}
