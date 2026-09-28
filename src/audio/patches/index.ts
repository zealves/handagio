import { keys } from './keys';
import { mallets } from './mallets';
import { strings } from './strings';
import { synths } from './synths';
import type { Patch } from './types';
import { winds } from './winds';

export const PATCH_LIST: Patch[] = [...keys, ...strings, ...winds, ...mallets, ...synths];
export const PATCHES: Record<string, Patch> = Object.fromEntries(PATCH_LIST.map((p) => [p.id, p]));
export type { Patch, Kit, Family } from './types';
