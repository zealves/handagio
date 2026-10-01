// Acesso à câmara: getUserMedia, escolha de câmara e erros com o código do navegador.

export class CameraError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

/**
 * Erro da câmara com o código do navegador (NotAllowedError, NotFoundError…). A mensagem para a
 * pessoa vem das línguas, pelo código (`cameraError` em src/i18n/data.ts); aqui fica só o código.
 */
export function translateCameraError(e: unknown): CameraError {
  const name = (e as { name?: string })?.name ?? 'Error';
  return new CameraError(name, name);
}

export interface CameraOptions {
  deviceId?: string | null;
  lowRes?: boolean;
}

/**
 * Resolução pedida à câmara. O vídeo não aparece no ecrã (o palco mostra só as mãos) e o
 * detetor de mãos trabalha com imagens pequenas (192–224 px), por isso 640×360 chega e custa um
 * quarto de 1280×720 a enviar para a GPU em cada fotograma. "Baixar a resolução" desce a 480×270.
 */
export const CAMERA_SIZE = { width: 640, height: 360 } as const;
export const CAMERA_SIZE_LOW = { width: 480, height: 270 } as const;
/** Fotogramas por segundo pedidos (ideal): algumas câmaras (e a falsa do Chromium) dão 20 sem pedir. */
export const CAMERA_FPS = 30;

/** Restrições de vídeo pedidas ao getUserMedia (sem a câmara). */
export function cameraConstraints(lowRes?: boolean): MediaTrackConstraints {
  const s = lowRes ? CAMERA_SIZE_LOW : CAMERA_SIZE;
  return {
    width: { ideal: s.width },
    height: { ideal: s.height },
    frameRate: { ideal: CAMERA_FPS },
  };
}

export async function openCamera(o: CameraOptions = {}): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw translateCameraError({ name: 'Unsupported' });
  const size = cameraConstraints(o.lowRes);
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
  return (
    all
      .filter((d) => d.kind === 'videoinput')
      // sem nome (antes de dar permissão), a interface mostra "Câmara 1", "Camera 1"…
      .map((d) => ({ id: d.deviceId, label: d.label }))
  );
}

export function stopStream(s: MediaStream | null | undefined): void {
  s?.getTracks().forEach((t) => t.stop());
}
