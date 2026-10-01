// Abrir e fechar a folha de configuração (pills, atalhos 1–4, avisos).
import { useStore } from '../../state/store';
import type { SheetTab } from '../../state/types';

/** Abre a folha na tab (ou fecha, se já estiver aberta nela); a tira dos acordes fecha. */
export function toggleSheet(tab: SheetTab): void {
  const { sheet, set } = useStore.getState();
  set(sheet === tab ? { sheet: null } : { sheet: tab, sheetTab: tab, chordStrip: false });
}
