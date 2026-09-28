import s from './controls.module.css';

interface Props {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}

export function Toggle({ label, checked, onChange, testId }: Props) {
  return (
    <label className={s.toggle}>
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
      <span className={s.switch} aria-hidden />
    </label>
  );
}
