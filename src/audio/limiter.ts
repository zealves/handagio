// Limitador de segurança à saída: um DynamicsCompressorNode com joelho 0 e razão alta.
// O algoritmo da especificação Web Audio aplica sempre um ganho de compensação ("makeup gain")
// que sobe tudo, mesmo abaixo do limiar; `limiterTrim` desfaz essa subida, para o limitador só
// atuar nos picos.

/** Limiar (dBFS) e razão do limitador. */
export const LIMIT_DB = -2;
export const LIMIT_RATIO = 20;

/**
 * Ganho que anula a compensação automática do compressor (joelho 0): pela especificação,
 * makeup = (1 / fullRangeGain)^0.6, em que fullRangeGain é a saída da curva para 0 dBFS.
 */
export function limiterTrim(thresholdDb: number, ratio: number): number {
  const fullRangeDb = thresholdDb - thresholdDb / ratio;
  const fullRangeGain = Math.pow(10, fullRangeDb / 20);
  return Math.pow(fullRangeGain, 0.6);
}
