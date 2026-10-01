import { useEffect, useState } from 'react';
import {
  downloadRecording,
  recordingUrl,
  refreshRecordings,
  removeRecording,
  shareRecording,
} from '../../app/recording';
import type { RecordingMeta } from '../../state/recordingsDb';
import { useStore } from '../../state/store';
import { useT } from '../../i18n';
import { IconButton } from '../controls/IconButton';
import { Toggle } from '../controls/Toggle';
import { IconDownload, IconPlay, IconShare, IconStop, IconTrash } from '../icons/UiIcons';
import { Panel } from './Panel';
import s from './RecordPanel.module.css';

const fmtDur = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const fmtSize = (b: number) =>
  b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`;

function Item({ r }: { r: RecordingMeta }) {
  const [url, setUrl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const all = useT();
  const tr = all.recordings;
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  useEffect(() => {
    if (!confirm) return;
    const id = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(id);
  }, [confirm]);
  const togglePlay = async () => {
    if (url) setUrl(null);
    else setUrl(await recordingUrl(r.id));
  };
  return (
    <li className={s.item} data-testid="recording-item">
      <div className={s.itemHead}>
        <span className={s.itemName} title={r.name}>
          {r.name}
        </span>
        <IconButton
          small
          label={url ? tr.stop(r.name) : tr.play(r.name)}
          onClick={togglePlay}
          aria-pressed={!!url}
        >
          {url ? <IconStop width={14} height={14} /> : <IconPlay width={14} height={14} />}
        </IconButton>
        <IconButton small label={tr.download(r.name)} onClick={() => void downloadRecording(r.id)}>
          <IconDownload width={14} height={14} />
        </IconButton>
        <IconButton small label={tr.share(r.name)} onClick={() => void shareRecording(r.id)}>
          <IconShare width={14} height={14} />
        </IconButton>
        <IconButton
          small
          label={confirm ? tr.confirmDel(r.name) : tr.del(r.name)}
          className={confirm ? s.confirm : undefined}
          onClick={() => (confirm ? void removeRecording(r.id) : setConfirm(true))}
        >
          <IconTrash width={14} height={14} />
        </IconButton>
      </div>
      <span className={s.itemMeta}>
        {fmtDur(r.duration)} · {fmtSize(r.size)} ·{' '}
        {new Date(r.createdAt).toLocaleTimeString(all.meta.htmlLang, {
          hour: '2-digit',
          minute: '2-digit',
        })}
        {confirm && tr.tapAgain}
      </span>
      {url &&
        (r.kind === 'video' ? (
          <video className={s.player} src={url} controls autoPlay playsInline />
        ) : (
          <audio className={s.player} src={url} controls autoPlay />
        ))}
    </li>
  );
}

export function RecordPanel() {
  const recordVideo = useStore((st) => st.recordVideo);
  const list = useStore((st) => st.recordings);
  const set = useStore((st) => st.set);
  const tr = useT().recordings;
  useEffect(() => void refreshRecordings(), []);
  return (
    <div className={s.wrap}>
      <Panel title={tr.title} defaultOpen>
        <Toggle
          label={tr.withVideo}
          checked={recordVideo}
          onChange={(v) => set({ recordVideo: v })}
        />
        {list.length ? (
          <ul className={s.list} aria-label={tr.list} data-testid="recordings">
            {list.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </ul>
        ) : (
          <p className={s.empty}>{tr.empty}</p>
        )}
      </Panel>
    </div>
  );
}
