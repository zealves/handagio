// Diagnóstico ligado em desenvolvimento ou com ?debug no endereço.
export const DEBUG =
  import.meta.env.DEV || new URLSearchParams(globalThis.location?.search ?? '').has('debug');
