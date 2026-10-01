// Controlo da gravação (sem React): começar/parar, guardar em IndexedDB, descarregar e partilhar.
import { audio } from '../audio/engine';
import { instrumentInfo } from '../audio/instruments';
import { extensionFor, Recorder } from '../audio/recorder';
import { drawSize } from '../state/live';
import {
  deleteRecording,
  getRecording,
  listRecordings,
  saveRecording,
  type Recording,
} from '../state/recordingsDb';
import { stageCanvases } from '../state/stageCanvases';
import { getState, setState } from '../state/store';
import { compositeSources } from '../ui/shell/logic';
import { session } from './session';

let recorder: Recorder | null = null;
let busy = false;

const pad = (n: number) => String(n).padStart(2, '0');
function fileName(r: Pick<Recording, 'createdAt' | 'mime'>): string {
  const d = new Date(r.createdAt);
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `handagio-${stamp}.${extensionFor(r.mime)}`;
}

export async function refreshRecordings(): Promise<void> {
  const list = await listRecordings();
  setState({
    recordings: list,
    lastRecordingId: getState().lastRecordingId ?? list[0]?.id ?? null,
  });
}

export async function startRecording(): Promise<void> {
  if (busy || getState().recording) return;
  if (!Recorder.supported) {
    setState({ status: 'Este navegador não consegue gravar (MediaRecorder indisponível).' });
    return;
  }
  session.ensureAudio();
  recorder ??= new Recorder(audio.ctx, audio.output);
  const s = getState();
  const v = session.video;
  const withVideo = s.recordVideo && !!v && v.readyState >= 2;
  try {
    recorder.start(
      withVideo
        ? {
            // a câmara só serve para a proporção: a gravação nunca inclui a imagem da pessoa
            video: compositeSources(stageCanvases).video,
            width: drawSize().w,
            height: drawSize().h,
            layers: () => compositeSources(stageCanvases).layers,
            hud: () => {
              const st = getState();
              return [`Nota: ${st.lastNote}`, `Voz: ${instrumentInfo(st.instrument).name}`];
            },
          }
        : undefined,
    );
    setState({ recording: true, recordStart: Date.now() });
  } catch (e) {
    console.warn('[gravação] não arrancou', e);
    setState({ status: 'A gravação não arrancou neste navegador.' });
  }
}

export async function stopRecording(): Promise<void> {
  if (!recorder || !getState().recording || busy) return;
  busy = true;
  try {
    const res = await recorder.stop();
    const createdAt = Date.now();
    const n = getState().recordings.length + 1;
    const rec: Recording = {
      id: `${createdAt}-${Math.random().toString(36).slice(2, 7)}`,
      name: `Gravação ${n}${res.kind === 'video' ? ' (vídeo)' : ''}`,
      blob: res.blob,
      mime: res.mime,
      kind: res.kind,
      duration: res.duration,
      createdAt,
    };
    await saveRecording(rec);
    setState({
      recording: false,
      lastRecordingId: rec.id,
      notice: { text: `${rec.name} guardada`, tab: 'estudio' },
    });
    await refreshRecordings();
  } finally {
    busy = false;
    setState({ recording: false });
  }
}

export const toggleRecording = () => (getState().recording ? stopRecording() : startRecording());

export async function recordingUrl(id: string): Promise<string | null> {
  const r = await getRecording(id);
  return r ? URL.createObjectURL(r.blob) : null;
}

export async function downloadRecording(
  id: string | null = getState().lastRecordingId,
): Promise<void> {
  if (!id) return;
  const r = await getRecording(id);
  if (!r) return;
  const url = URL.createObjectURL(r.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName(r);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Web Share API com o ficheiro, se existir; senão descarrega. */
export async function shareRecording(
  id: string | null = getState().lastRecordingId,
): Promise<void> {
  if (!id) return;
  const r = await getRecording(id);
  if (!r) return;
  const file = new File([r.blob], fileName(r), { type: r.mime });
  const data = {
    files: [file],
    title: 'Handagio',
    text: 'Música feita com as mãos no Handagio.',
  };
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  await downloadRecording(id);
}

export async function removeRecording(id: string): Promise<void> {
  await deleteRecording(id);
  if (getState().lastRecordingId === id) setState({ lastRecordingId: null });
  await refreshRecordings();
}
