import { useId } from 'react';
import s from './controls.module.css';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  testId?: string;
}

export function Slider({ label, value, min, max, step = 1, onChange, format, testId }: Props) {
  const id = useId();
  const p = ((value - min) / (max - min)) * 100;
  const shown = format ? format(value) : String(value);
  return (
    <div className={s.slider}>
      <div className={s.sliderHead}>
        <label htmlFor={id}>{label}</label>
        <span className="tnum">{shown}</span>
      </div>
      <input
        id={id}
        type="range"
        className={s.range}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={shown}
        style={{ ['--p' as string]: `${p}%` }}
        onChange={(e) => onChange(+e.target.value)}
        data-testid={testId}
      />
    </div>
  );
}
