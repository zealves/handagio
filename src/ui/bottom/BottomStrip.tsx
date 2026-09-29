import { DrumPads } from './DrumPads';
import { PianoKeyboard } from './PianoKeyboard';
import { WaveformStrip } from './WaveformStrip';
import s from './bottom.module.css';

export function BottomStrip() {
  return (
    <div className={s.strip}>
      <PianoKeyboard />
      <div className={s.scroll}>
        <DrumPads />
      </div>
      <WaveformStrip />
    </div>
  );
}
