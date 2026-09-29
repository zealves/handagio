// Registo dos canvas do palco, para o compositor de vídeo da gravação os poder desenhar.
export const stageCanvases: {
  waves: HTMLCanvasElement | null;
  particles: HTMLCanvasElement | null;
  overlay: HTMLCanvasElement | null;
} = {
  waves: null,
  particles: null,
  overlay: null,
};
