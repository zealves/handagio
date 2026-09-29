// 8 pads de percussão (2×4), mapeados para o kit atual; iluminam quando disparam.
import { useRef, type KeyboardEvent } from 'react';
import { session } from '../../app/session';
import { DRUMS } from '../../audio/instruments';
import { live } from '../../state/live';
import { useStore } from '../../state/store';
import { useFrame } from '../frame';
import { FINGER_COLORS } from '../theme';
import s from './bottom.module.css';

const PAD_FINGER = [1, 2, 3, 4, 6, 7, 8, 9];

export function DrumPads() {
  const instrument = useStore((st) => st.instrument);
  const kit = DRUMS[instrument] ?? DRUMS.drums;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useFrame(() => {
    refs.current.forEach((el, k) => {
      if (!el) return;
      const v = live.pads[k];
      if (v > 0.05) {
        if (!el.dataset.on) el.dataset.on = '1';
        el.style.opacity = String(0.5 + v * 0.5);
      } else if (el.dataset.on) {
        delete el.dataset.on;
        el.style.opacity = '';
      }
    });
  });

  const onKey = (e: KeyboardEvent, k: number) => {
    if (e.key === 'Enter' && !e.repeat) {
      e.preventDefault();
      session.padDown(k);
    }
  };

  return (
    <div className={s.pads} role="group" aria-label={`Pads de percussão: ${kit.name}`}>
      {kit.labels.slice(0, 8).map((label, k) => (
        <button
          key={k}
          ref={(el) => {
            refs.current[k] = el;
          }}
          type="button"
          className={s.pad}
          style={{ ['--c' as string]: FINGER_COLORS[PAD_FINGER[k]] }}
          onPointerDown={(e) => {
            e.preventDefault();
            session.padDown(k);
          }}
          onKeyDown={(e) => onKey(e, k)}
          aria-label={`Pad ${k + 1}: ${label}`}
          data-testid={`pad-${k}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
