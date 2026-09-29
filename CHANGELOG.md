# Changelog

Versões segundo [SemVer](https://semver.org/lang/pt-BR/). A mais recente fica no topo.

## [2.0.0] — por lançar

Interface redesenhada para pôr o foco em tocar. A lógica de som e de visão não muda.

- Palco em primeiro plano, com uma barra de controlo e gavetas no lugar das três colunas e dos separadores.
- Ecrã inteiro (`E`) e esconder interface (`I`), com a barra a espreitar ao mexer o rato.
- Fundo do palco: Só mãos (a pessoa não aparece, nem na gravação; é o valor por defeito), Ondas ou Câmara (opção escondida no menu ⋯ e nas Definições).
- Um só visualizador (ondas sobrepostas); os canvases fora do ecrã deixam de desenhar.
- Seletor de instrumentos com pesquisa, recentes e grupos por família; `,` e `.` mudam de instrumento.
- Efeitos em cartões (reverb, eco/delay, pitch, filtro, drive, boca), com reverb e eco à mão na barra.
- Layout para telemóvel (folha inferior), tablet, desktop e paisagem baixa.
- Oitava, sensibilidade, altura da mão e deslizar passam para as Definições, com a lista de atalhos.

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
