// Regra partilhada pelas notas do teclado e pelos atalhos: não reagir enquanto se escreve ou
// se ajusta um controlo (decisão 14).
export interface KeyTarget {
  tagName: string;
  isContentEditable?: boolean;
  getAttribute(name: string): string | null;
}

export function isTypingTarget(t: KeyTarget | null): boolean {
  if (!t || typeof t.tagName !== 'string') return false;
  const tag = t.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    !!t.isContentEditable ||
    t.getAttribute('role') === 'slider'
  );
}
