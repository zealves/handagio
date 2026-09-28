// Acesso à câmara: getUserMedia, escolha de câmara e erros traduzidos para português.

export class CameraError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

export function translateCameraError(e: unknown): CameraError {
  const name = (e as { name?: string })?.name ?? 'Error';
  const msg: Record<string, string> = {
    NotAllowedError:
      'O acesso à câmara foi bloqueado. Carrega no ícone da câmara ou do cadeado na barra de endereço, permite a câmara e recarrega a página.',
    SecurityError:
      'O navegador não deixa usar a câmara nesta página. Abre-a por https ou em localhost.',
    NotFoundError: 'Não encontrei nenhuma câmara ligada a este computador.',
    OverconstrainedError:
      'A câmara escolhida já não está disponível. Escolhe outra nas definições.',
    NotReadableError:
      'A câmara está a ser usada por outra app (videochamada, por exemplo). Fecha-a e tenta outra vez.',
    AbortError: 'A câmara não arrancou. Tenta outra vez.',
    Unsupported:
      'Este navegador não dá acesso à câmara. Experimenta o Chrome, o Edge, o Firefox ou o Safari recentes.',
  };
  return new CameraError(name, msg[name] ?? `A câmara não arrancou (${name}). Tenta outra vez.`);
}

export interface CameraOptions {
  deviceId?: string | null;
  lowRes?: boolean;
}

export async function openCamera(o: CameraOptions = {}): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw translateCameraError({ name: 'Unsupported' });
  const size = o.lowRes
    ? { width: { ideal: 640 }, height: { ideal: 360 } }
    : { width: { ideal: 1280 }, height: { ideal: 720 } };
  const video: MediaTrackConstraints = o.deviceId
    ? { ...size, deviceId: { exact: o.deviceId } }
    : { ...size, facingMode: 'user' };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (e) {
    // Câmara guardada que já não existe: tenta a predefinida antes de desistir.
    if (o.deviceId && (e as Error).name === 'OverconstrainedError') {
      return openCamera({ lowRes: o.lowRes });
    }
    throw translateCameraError(e);
  }
}

export async function listCameras(): Promise<{ id: string; label: string }[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === 'videoinput')
    .map((d, k) => ({ id: d.deviceId, label: d.label || `Câmara ${k + 1}` }));
}

export function stopStream(s: MediaStream | null | undefined): void {
  s?.getTracks().forEach((t) => t.stop());
}
