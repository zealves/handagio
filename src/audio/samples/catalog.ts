// Catálogo dos instrumentos com amostras gravadas: nome, registo (oitavas) e patch de reserva
// usado enquanto as amostras carregam ou se as amostras falharem.
import type { Family } from '../patches/types';

export type SampleKind = 'sustained' | 'plucked' | 'struck';

export interface SampledDef {
  id: string;
  name: string;
  family: Exclude<Family, 'Percussão'>;
  desc: string;
  kind: SampleKind;
  /** Oitavas somadas à oitava base. */
  register: number;
  /** Constante de tempo da libertação (sustained, struck). */
  rel: number;
  /** Patch sintetizado usado enquanto as amostras carregam ou se falharem. */
  fallback: string;
}

export const SAMPLED: SampledDef[] = [
  {
    id: 'piano',
    name: 'Piano',
    family: 'Teclas',
    kind: 'struck',
    register: 0,
    rel: 0.4,
    fallback: 'piano',
    desc: 'Piano de cauda gravado.',
  },
  {
    id: 'organ',
    name: 'Órgão',
    family: 'Teclas',
    kind: 'sustained',
    register: 0,
    rel: 0.1,
    fallback: 'organ',
    desc: 'Órgão de tubos; sustenta enquanto seguras.',
  },
  {
    id: 'violin',
    name: 'Violino',
    family: 'Cordas',
    kind: 'sustained',
    register: 0,
    rel: 0.2,
    fallback: 'violin',
    desc: 'Violino com arco.',
  },
  {
    id: 'cello',
    name: 'Violoncelo',
    family: 'Cordas',
    kind: 'sustained',
    register: -1,
    rel: 0.25,
    fallback: 'cello',
    desc: 'Cordas graves e quentes.',
  },
  {
    id: 'contrabass',
    name: 'Contrabaixo',
    family: 'Cordas',
    kind: 'sustained',
    register: -2,
    rel: 0.25,
    fallback: 'cello',
    desc: 'O mais grave das cordas.',
  },
  {
    id: 'bass',
    name: 'Baixo elétrico',
    family: 'Cordas',
    kind: 'plucked',
    register: -2,
    rel: 0.2,
    fallback: 'bass',
    desc: 'Baixo dedilhado.',
  },
  {
    id: 'harp',
    name: 'Harpa',
    family: 'Cordas',
    kind: 'plucked',
    register: 0,
    rel: 0.3,
    fallback: 'harp',
    desc: 'Cordas beliscadas que ressoam.',
  },
  {
    id: 'guitar',
    name: 'Guitarra acústica',
    family: 'Cordas',
    kind: 'plucked',
    register: -1,
    rel: 0.3,
    fallback: 'pluck',
    desc: 'Cordas de aço, dedilhadas.',
  },
  {
    id: 'eguitar',
    name: 'Guitarra elétrica',
    family: 'Cordas',
    kind: 'plucked',
    register: -1,
    rel: 0.3,
    fallback: 'pluck',
    desc: 'Guitarra limpa, sem distorção.',
  },
  {
    id: 'flute',
    name: 'Flauta',
    family: 'Sopros',
    kind: 'sustained',
    register: 1,
    rel: 0.15,
    fallback: 'flute',
    desc: 'Flauta transversal.',
  },
  {
    id: 'clarinet',
    name: 'Clarinete',
    family: 'Sopros',
    kind: 'sustained',
    register: 0,
    rel: 0.15,
    fallback: 'flute',
    desc: 'Madeira escura e redonda.',
  },
  {
    id: 'sax',
    name: 'Saxofone',
    family: 'Sopros',
    kind: 'sustained',
    register: 0,
    rel: 0.15,
    fallback: 'sax',
    desc: 'Saxofone expressivo.',
  },
  {
    id: 'bassoon',
    name: 'Fagote',
    family: 'Sopros',
    kind: 'sustained',
    register: -1,
    rel: 0.15,
    fallback: 'sax',
    desc: 'Madeira grave.',
  },
  {
    id: 'brass',
    name: 'Trompete',
    family: 'Sopros',
    kind: 'sustained',
    register: 0,
    rel: 0.12,
    fallback: 'brass',
    desc: 'Metal brilhante.',
  },
  {
    id: 'horn',
    name: 'Trompa',
    family: 'Sopros',
    kind: 'sustained',
    register: -1,
    rel: 0.15,
    fallback: 'brass',
    desc: 'Metal suave e redondo.',
  },
  {
    id: 'trombone',
    name: 'Trombone',
    family: 'Sopros',
    kind: 'sustained',
    register: -1,
    rel: 0.15,
    fallback: 'brass',
    desc: 'Metal grave.',
  },
  {
    id: 'tuba',
    name: 'Tuba',
    family: 'Sopros',
    kind: 'sustained',
    register: -2,
    rel: 0.15,
    fallback: 'brass',
    desc: 'O mais grave dos metais.',
  },
  {
    id: 'xylophone',
    name: 'Xilofone',
    family: 'Lâminas',
    kind: 'struck',
    register: 1,
    rel: 0.3,
    fallback: 'marimba',
    desc: 'Lâminas de madeira, secas e brilhantes.',
  },
];

export const SAMPLED_BY_ID: Record<string, SampledDef> = Object.fromEntries(
  SAMPLED.map((s) => [s.id, s]),
);

export const isSampled = (id: string): boolean => id in SAMPLED_BY_ID;
