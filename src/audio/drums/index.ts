import { acoustic } from './acoustic';
import { latin } from './latin';
import { tr808 } from './tr808';
import type { DrumKit } from './types';

export const DRUM_KITS: DrumKit[] = [acoustic, tr808, latin];
export const DRUMS: Record<string, DrumKit> = Object.fromEntries(DRUM_KITS.map((k) => [k.id, k]));
export type { DrumKit } from './types';
