// Registo dos canvas do palco, para o compositor de vídeo da gravação os poder desenhar.
export const stageCanvases: {
  particles: HTMLCanvasElement | null;
  overlay: HTMLCanvasElement | null;
} = {
  particles: null,
  overlay: null,
};
