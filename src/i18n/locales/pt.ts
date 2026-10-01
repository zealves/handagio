// Português (pt-PT): a fonte de verdade das mensagens. As outras línguas têm este tipo.
import { DRUMS, INSTRUMENTS } from '../../audio/instruments';
import { FAMILIES } from '../../audio/patches/types';
import { CHORD_MODES, PT_NAMING, SCALE_GROUPS, SCALE_NAMES, type Naming } from '../../audio/theory';
import { FACTORY_PRESETS } from '../../state/presets';
import { MOUTH_FX } from '../../state/types';
import { FINGER_NAMES } from '../../vision/fingerMap';

const byId = <T, V>(list: readonly T[], key: (x: T) => string, val: (x: T) => V) =>
  Object.fromEntries(list.map((x) => [key(x), val(x)])) as Record<string, V>;
const same = (list: readonly string[]) =>
  byId(
    list,
    (x) => x,
    (x) => x,
  );

/** Rótulos curtos das formas de tocar (a tira tem de caber em 375 px). */
const CHORD_SHORT: Record<string, string> = {
  off: 'Nota',
  octave: 'Oitava',
  power: 'Quinta',
  triad: 'Acorde',
  sus4: 'Sus',
  seventh: 'Sétima',
  ninth: 'Nona',
};
/** Explicação de cada forma de tocar no modo Personalizado (sem escala, meios-tons fixos). */
const CHORD_CUSTOM: Record<string, string> = {
  off: 'Cada dedo toca a nota que lhe escolheste.',
  octave: 'A Oitava junta à nota do dedo a mesma nota 12 meios-tons acima.',
  power: 'A Quinta junta à nota do dedo a quinta (7 meios-tons acima) e a oitava (12 acima).',
  triad:
    'Sem escala, o Acorde é sempre maior: a nota do dedo e as que ficam 4 e 7 meios-tons acima.',
  sus4: 'O Suspenso junta à nota do dedo as que ficam 5 e 7 meios-tons acima.',
  seventh:
    'Sem escala, a Sétima é sempre um acorde maior com sétima: a nota do dedo e as que ficam 4, 7 e 10 meios-tons acima.',
  ninth:
    'Sem escala, a Nona junta à Sétima a nona: a nota do dedo e as que ficam 4, 7, 10 e 14 meios-tons acima.',
};

const pt = {
  /** Solfejo: Dó, Ré, Mi… e "Sol 7", "Ré m". */
  naming: PT_NAMING as Naming,
  /**
   * Textos dos dados, pelo id. Em português vêm dos próprios dados (instrumentos, kits, formas de
   * tocar, efeitos da boca, escalas e famílias têm o id ou o nome em português), sem os repetir.
   */
  data: {
    instruments: byId(
      INSTRUMENTS,
      (i) => i.id,
      (i) => ({ name: i.name, desc: i.desc }),
    ),
    families: same(FAMILIES),
    scales: same(SCALE_NAMES),
    scaleGroups: same(SCALE_GROUPS.map((g) => g.label)),
    chords: byId(
      CHORD_MODES,
      (c) => c.id,
      (c) => ({
        label: c.label,
        short: CHORD_SHORT[c.id],
        desc: c.desc,
        custom: CHORD_CUSTOM[c.id],
      }),
    ),
    mouth: byId(
      MOUTH_FX,
      (m) => m.id,
      (m) => ({ label: m.label, desc: m.desc }),
    ),
    kits: Object.fromEntries(Object.entries(DRUMS).map(([k, d]) => [k, [...d.labels]])) as Record<
      string,
      string[]
    >,
    presets: same(Object.keys(FACTORY_PRESETS)),
    fingers: [...FINGER_NAMES] as string[],
    hands: { left: 'E', right: 'D' },
  },
  camera: {
    errors: {
      NotAllowedError:
        'O acesso à câmara foi bloqueado. Carrega no ícone da câmara ou do cadeado na barra de endereço, permite a câmara e recarrega a página.',
      SecurityError:
        'O navegador não deixa usar a câmara nesta página. Abre-a por https ou em localhost.',
      NotFoundError: 'Não encontrei nenhuma câmara ligada a este computador.',
      OverconstrainedError:
        'A câmara escolhida já não está disponível. Escolhe outra nas definições.',
      NotReadableError:
        'A câmara está a ser usada por outra app (videochamada, por exemplo). Fecha-a e tenta outra vez.',
      AbortError: 'A câmara não arrancou. Tenta outra vez.',
      Unsupported:
        'Este navegador não dá acesso à câmara. Experimenta o Chrome, o Edge, o Firefox ou o Safari recentes.',
    } as Record<string, string>,
    unknown: (code: string) => `A câmara não arrancou (${code}). Tenta outra vez.`,
  },
  status: {
    askCamera: 'A pedir acesso à câmara…',
    cameraOn: 'Câmara ligada. A carregar o detetor de dedos…',
    ready: 'Pronto. Mostra as mãos e dobra os dedos.',
    cameraFailed: 'A câmara não arrancou.',
    motion:
      'Modo movimento: o detetor de dedos não carregou, por isso cada coluna do ecrã é um dedo. Mexe a mão numa coluna para tocar.',
    calibNeedsHands: 'A calibração precisa da deteção das mãos. Liga a câmara primeiro.',
    calibOpen: 'Mostra as duas mãos e estica bem todos os dedos.',
    calibClosed: 'Agora dobra todos os dedos.',
    calibCount: (text: string, k: number) => `${text} ${k}…`,
    calibDone: (n: number) =>
      `Calibração feita para ${n} dedos. Podes voltar a calibrar ou repor nas definições.`,
    calibFailed:
      'Não consegui ver bem os dedos. Põe as mãos à frente da câmara com boa luz e tenta outra vez.',
    recUnsupported: 'Este navegador não consegue gravar (MediaRecorder indisponível).',
    recFailed: 'A gravação não arrancou neste navegador.',
  },
  rec: {
    name: (n: number, video: boolean) => `Gravação ${n}${video ? ' (vídeo)' : ''}`,
    saved: (name: string) => `${name} guardada`,
    shareText: 'Música feita com as mãos no Handagio.',
    hudNote: (note: string) => `Nota: ${note}`,
    hudVoice: (voice: string) => `Voz: ${voice}`,
  },
  coach: {
    hands: 'Mostra as duas mãos à câmara',
    bend: 'Dobra um dedo para tocar',
    mouth: 'Abre a boca para um efeito 👄',
    touch: 'Toca nas teclas para ouvir',
  },
  header: {
    touchShow: 'Tocar no ecrã',
    touchHide: 'Esconder o teclado no ecrã',
    fullscreen: 'Ecrã inteiro (E)',
    exitFullscreen: 'Sair do ecrã inteiro (E)',
    record: 'Gravar',
    stopRecording: 'Parar a gravação',
    settings: 'Definições',
  },
  hud: {
    note: 'Nota:',
    recording: 'A gravar',
    loop: 'Loop:',
    loopState: { armed: 'à espera', recording: 'a gravar', playing: 'a tocar' },
    cameraOn: 'Ligar câmara',
    engineTitle: 'Modo de deteção',
    engine: { hands: 'Mãos', motion: 'Movimento', keyboard: 'Teclado' },
  },
  start: {
    title: 'Começar a tocar com as mãos',
    go: 'Começar',
    privacy: '🔒 O vídeo fica no teu dispositivo: nada é enviado.',
    touch: 'Sem câmara? Tocar no ecrã',
    keys: 'Teclado:',
    rightKeys: ['J', 'K', 'L', 'Ç'],
    space: 'Espaço',
    mouth: '= boca',
    camTitle: 'Sem acesso à câmara',
    retry: 'Tentar outra vez',
    touchShort: 'Tocar no ecrã',
  },
  dock: {
    closeMessage: 'Fechar a mensagem',
    dismissCoach: 'Dispensar as dicas',
    view: 'Ver',
    pills: 'Som atual',
    instrument: (name: string) => `Instrumento: ${name}`,
    loading: ' (a carregar)',
    loadError: ' (erro ao carregar)',
    instrumentsTitle: 'Instrumentos (, e . para mudar)',
    customNotes: 'Notas personalizadas',
    notesAria: (root: string, scale: string) => `Notas: ${root} ${scale}`,
    customNotesAria: 'Notas: personalizadas',
    eachFinger: (mode: string) => `Cada dedo toca: ${mode}`,
  },
  sheet: {
    label: 'Configurar o som',
    tabsLabel: 'Configuração',
    tabs: { som: 'Som', notas: 'Notas', efeitos: 'Efeitos', estudio: 'Estúdio' },
    close: 'Fechar',
  },
  presets: {
    title: 'Sons guardados',
    add: 'Guardar',
    save: 'Guardar',
    namePlaceholder: 'Nome do som',
    nameAria: 'Nome para guardar o som atual',
    factoryName: 'Esse nome é de um som de fábrica. Escolhe outro.',
    saved: (n: string) => `"${n}" guardado.`,
    deleted: (n: string) => `"${n}" apagado.`,
    del: (n: string) => `Apagar ${n}`,
    confirmDel: (n: string) => `Confirmar: apagar ${n}`,
    confirmShort: 'Apagar?',
    hint: 'Um som junta o instrumento, as notas, os efeitos e o tempo.',
  },
  picker: {
    title: 'Instrumento',
    all: 'Todos',
    filters: 'Filtrar por família',
    search: 'Procurar instrumento',
    searchPlaceholder: 'Procurar instrumento…',
    recorded: 'gravado',
    loadError: 'Não foi possível carregar — toca para tentar de novo',
    empty: 'Nenhum instrumento encontrado.',
  },
  fx: {
    mouthTitle: 'Efeito da boca 👄',
    title: 'Efeitos',
    reset: 'Repor efeitos',
    resetConfirm: 'Repor? Toca outra vez',
    mouthLabel: 'Efeito da boca',
    mouth: 'Boca',
    meter: { unavailable: 'indisponível', waiting: 'à espera', closed: 'fechada' },
    hintOpen: 'Abre a boca para aplicar; segura',
    hintSimulate: 'para simular.',
    knobs: {
      reverb: { label: 'Reverb', desc: 'Espaço à volta do som' },
      echo: { label: 'Eco', desc: 'Delay: repetições do som' },
      pitch: { label: 'Pitch', desc: 'Transpõe tudo em semitons' },
      filter: { label: 'Filtro', desc: 'Fecha para abafar o som' },
      drive: { label: 'Drive', desc: 'Saturação quente' },
    },
  },
  meta: {
    htmlLang: 'pt-PT',
    title: 'Handagio — Vision Sound Cam',
    description: 'Handagio: instrumento musical que se toca com as mãos à frente da câmara.',
  },
};

export default pt;
