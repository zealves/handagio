// Knob rotativo: arrastar na vertical, roda do rato, teclado e duplo clique para repor.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import s from './Knob.module.css';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  size?: number;
  testId?: string;
  /** Compacto (rodapé): o valor só aparece no lugar do rótulo com o rato por cima ou o foco. */
  compact?: boolean;
}

const START = -135;
const SWEEP = 270;

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export function Knob({
  label,
  value,
  min,
  max,
  step = 0.01,
  defaultValue,
  onChange,
  format,
  size = 64,
  testId,
  compact = false,
}: Props) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const valRef = useRef(value);
  useLayoutEffect(() => {
    valRef.current = value;
  }, [value]);

  const clampStep = (v: number) => {
    const q = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, +q.toFixed(6)));
  };
  const commit = (v: number) => {
    const c = clampStep(v);
    if (c !== valRef.current) onChange(c);
  };

  // A roda precisa de um listener não passivo para impedir o scroll da página.
  useEffect(() => {
    const el = ref.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const range = max - min;
      const d = (-e.deltaY / 100) * range * (e.shiftKey ? 0.01 : 0.04);
      const c = clampStep(valRef.current + (Math.abs(d) < step ? Math.sign(d) * step : d));
      if (c !== valRef.current) onChange(c);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, step, onChange]);

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    ref.current?.focus();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const px = e.shiftKey ? 800 : 180; // 180 px = curso completo
    commit(drag.current.v + ((drag.current.y - e.clientY) / px) * (max - min));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKey = (e: KeyboardEvent) => {
    const big = (max - min) / 10;
    const map: Record<string, number> = {
      ArrowUp: step,
      ArrowRight: step,
      ArrowDown: -step,
      ArrowLeft: -step,
      PageUp: big,
      PageDown: -big,
    };
    if (e.key in map) {
      e.preventDefault();
      commit(value + map[e.key] * (e.shiftKey ? 5 : 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      commit(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      commit(max);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      commit(defaultValue);
    }
  };

  const f = (value - min) / (max - min);
  const a = START + f * SWEEP;
  const text = format ? format(value) : value.toFixed(2);
  const gid = `${id}-g`;
  return (
    <div
      className={s.knob}
      style={size < 64 ? { gap: 2 } : undefined}
      data-compact={compact || undefined}
    >
      <div
        ref={ref}
        className={s.dial}
        style={{ width: size, height: size }}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={+value.toFixed(3)}
        aria-valuetext={text}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => commit(defaultValue)}
        onKeyDown={onKey}
        title={`${label}: ${text} (duplo clique para repor)`}
        data-testid={testId}
      >
        <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="var(--cyan)" />
              <stop offset="1" stopColor="var(--magenta)" />
            </linearGradient>
          </defs>
          <path
            d={arc(32, 32, 27, START, START + SWEEP)}
            stroke="var(--line-strong)"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          {f > 0.001 && (
            <path
              d={arc(32, 32, 27, START, a)}
              stroke={`url(#${gid})`}
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 4px rgba(53,224,255,.55))' }}
            />
          )}
          <circle cx="32" cy="32" r="19" fill="var(--bg-2)" stroke="var(--line-strong)" />
          <line
            x1="32"
            y1="32"
            x2="32"
            y2="17"
            stroke="var(--ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
            transform={`rotate(${a} 32 32)`}
          />
        </svg>
      </div>
      <span className={s.label} aria-hidden>
        {label}
      </span>
      <span className={s.value} aria-hidden>
        {text}
      </span>
    </div>
  );
}
