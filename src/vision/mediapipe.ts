// FilesetResolver único, partilhado pelo HandLandmarker e pelo FaceLandmarker.
// Os ficheiros vêm de public/mediapipe/ (npm run fetch-models), sem CDNs.
import { FilesetResolver } from '@mediapipe/tasks-vision';

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
let fileset: Promise<Fileset> | null = null;

export const assetUrl = (path: string): string =>
  new URL(`${import.meta.env.BASE_URL}mediapipe/${path}`, location.href).href;

export function getVisionFileset(): Promise<Fileset> {
  if (!fileset) {
    fileset = FilesetResolver.forVisionTasks(assetUrl('wasm'));
    fileset.catch(() => (fileset = null));
  }
  return fileset;
}

/** Cria uma tarefa com delegate GPU e, se falhar, volta a tentar em CPU. */
export async function createWithFallback<T>(
  make: (delegate: 'GPU' | 'CPU') => Promise<T>,
): Promise<{ task: T; delegate: 'GPU' | 'CPU' }> {
  try {
    return { task: await make('GPU'), delegate: 'GPU' };
  } catch (e) {
    console.info('[visão] GPU indisponível, a usar CPU.', e);
    return { task: await make('CPU'), delegate: 'CPU' };
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${what}: tempo esgotado`)), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}
