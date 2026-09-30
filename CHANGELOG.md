# Changelog

Versões segundo [SemVer](https://semver.org/lang/pt-BR/). A mais recente fica no topo.

## [2.0.0] — por lançar

Interface redesenhada para pôr o foco em tocar, e instrumentos acústicos gravados. A deteção dos dedos não muda; a mão esquerda e a direita passam a reconhecer-se pela lateralidade do MediaPipe.

- Palco em primeiro plano, com uma barra de controlo e gavetas no lugar das três colunas e dos separadores.
- Ecrã inteiro (`E`) e esconder interface (`I`), com a barra a espreitar ao mexer o rato.
- O palco mostra sempre só as mãos (a pessoa não aparece, nem na gravação); ondas sempre por baixo do palco, mais leves.
- Um só visualizador (ondas sobrepostas); os canvases fora do ecrã deixam de desenhar.
- Seletor de instrumentos com pesquisa e grupos por família; `,` e `.` mudam de instrumento.
- Efeitos em cartões (reverb, eco/delay, pitch, filtro, drive, boca), com reverb e eco à mão na barra.
- Layout para telemóvel (folha inferior), tablet, desktop e paisagem baixa.
- Oitava, sensibilidade, altura da mão e arrastar passam para as Definições, com a lista de atalhos.
- Altura da mão e arrastar são duas opções independentes: "A altura da mão escolhe a nota" (desligada por defeito) e "Arrastar a nota depois de tocar", que dobra o tom a partir da nota tocada, também no modo Personalizado.
- Notas dos dedos em modo Escala (por defeito Dó Maior com a tónica no mindinho esquerdo, `Dó4 … Dó5`; ou tónica no indicador direito) ou Personalizado (a nota de cada dedo escolhida à mão); polegares mais difíceis de disparar sem querer, com sensibilidade própria.
- Instrumentos acústicos com gravações reais e 9 novos (contrabaixo, clarinete, fagote, trompa, trombone, tuba, guitarra acústica, guitarra elétrica, xilofone), cada um no seu registo.

## [1.0.0] — 2026-09-29

Primeira versão completa, com layout de três colunas e separadores Som / Música / Câmara.

- Câmara com MediaPipe `tasks-vision`: deteção da dobra dos dedos, overlay neon e modo movimento como alternativa.
- Motor de som em Web Audio: 26 patches melódicos, theremin e 3 kits de percussão; modo teclado.
- Controlo pela boca (FaceLandmarker) com efeitos e medidor.
- Efeitos globais: reverb, eco, pitch, filtro e drive.
- Escalas, tónica, oitava e acordes (nota, tríade, sétima, quinta), com polegares opcionais.
- Metrónomo, tap tempo, quantização e looper.
- Gravação de áudio e vídeo com lista em IndexedDB, descarregar e partilhar.
- Presets, calibração, definições, tema claro, PWA e testes e2e.
- Deploy automático por FTP para handagio.com; desbloqueio de áudio no iOS.

[2.0.0]: https://github.com/zealves/handagio/releases/tag/v2.0.0
[1.0.0]: https://github.com/zealves/handagio/releases/tag/v1.0.0
