# Changelog

Versões segundo [SemVer](https://semver.org/lang/pt-BR/). A mais recente fica no topo.

## [3.3.0] — 2026-10-03

- Modo de jogo: no início escolhes Tocar livre ou Jogar, e lá dentro trocas no interruptor Livre | Jogo do cabeçalho. As notas descem pela pista e dobras o dedo certo quando chegam à linha. Cada dobra toca a nota da faixa por cima de bateria e baixo, numa música nova a cada ronda; os pontos dependem do tempo.
- Escolhes os dedos que jogam (de 2 a 8; por exemplo, só a mão direita).
- Acertar ficou mais fácil:
  - cada dobra soa sempre;
  - as janelas são mais largas;
  - "Cedo!" e "Tarde!" mostram por quanto falhaste;
  - os alvos são maiores;
  - o atraso da câmara ajusta-se sozinho.
- Pausa com o botão, o P ou o Esc, com contagem ao continuar. Esconder o separador também pausa.
- Rondas de cerca de um minuto e meio, com pontos, precisão, combo máximo e o recorde guardado por nível.
- As notas rápidas alternam de mão: na mesma mão nunca ficam a menos de 0,3 s uma da outra, e a nota que muda de mão vai para o dedo correspondente da outra (não sempre para o do meio). Só com uma mão, as notas ficam a pelo menos 0,3 s (1 tempo no Médio e no Difícil).
- O cartão de entrada é o menu do jogo: a lista dos níveis, os dedos e Jogar, com o atraso da câmara dentro de "Avançado". A pausa, o resultado e o ✕ da pista voltam a este menu em vez de saírem logo para o modo livre.
- Escolhes os dedos como as duas mãos desenhadas no ecrã, dedo a dedo ou pelos atalhos (só a esquerda, só a direita, indicadores e médios).
- Níveis: três músicas com estilos diferentes (Pop em Dó Maior a 90 BPM, Noite em Ré Dórica a 90 BPM, Neon em Lá Menor a 112 BPM), cada uma com o seu instrumento. Acertar dá estrelas: ★ a 50% de precisão abre o nível seguinte. O progresso fica guardado neste dispositivo.
- Fora da música (menu, contagem, cauda, resultado e pausa) nenhuma dobra ou tecla soa nem conta, nem no modo contínuo nem no teclado; os clarões dos dedos só aparecem enquanto a nota soa. Abrir o menu do jogo liberta vozes presas (um teremim a soar, por exemplo).
- Um toque fora do tempo de qualquer nota por julgar conta como toque errado: parte o combo e baixa a precisão (a novidade é a precisão contar também os toques errados; os falhados já contavam); um toque a menos de 150 ms (antes ou depois) de um acerto na mesma faixa ou na faixa ao lado da mesma mão não conta como errado, para a câmara ou um dedo vizinho arrastado não penalizarem. O primeiro "Cedo!"/"Tarde!" numa nota parte o combo mas não conta como errado; insistir na mesma nota já conta. Um acerto tardio na última nota, com o atraso da câmara, já não se perde. O resultado mostra "Toques errados: N".
- A nota, o alvo e o dedo no desenho das mãos usam sempre a cor do dedo; "Cedo!"/"Tarde!" ficam brancos, e os falhados e os errados, vermelhos. O alvo de cada faixa passa a ser uma pílula com a forma da nota, maior do que antes. Com o jogo a decorrer ou em pausa, o desenho das mãos destaca os dedos que jogam (pílulas maiores, da sua cor, a encher com a dobra e a crescer quando soam, sem o nome da nota nem o clarão redondo por cima) e apaga os outros dedos e o esqueleto.
- No resultado, a dica de desbloqueio só aparece se existir mesmo um nível seguinte por abrir, e um recorde de 0 pontos mostra "Sem recorde".
- Os níveis 2 e 3, agora Noite e Neon (os ids `lofi` e `electro` ficam os mesmos; o progresso guardado não se perde), trocam a melodia ao acaso por músicas escritas à mão, com tapete de acordes, baixo e bateria próprios para cada uma, sem swing e com instrumentos mais agradáveis de ouvir (vibrafone e pluck).
- Energia: encher a barra (acertando notas) e fechar a mão — ou premir Espaço no teclado — ativa-a durante 8 segundos, com os pontos a dobrar e a pista a brilhar a dourado. Os dedos da mão a fechar-se não contam como toques errados.
- No jogo não se deteta a cara, o que poupa os computadores mais lentos. A boca só aplica efeitos no modo livre.
- Jogar só com uma mão deixa de mostrar a outra no ecrã, e a mão sozinha à frente da câmara joga sempre, seja qual for o lado onde aparece.
- Barra de vida: cada acerto sobe-a; as falhas, os toques errados e os "Cedo!"/"Tarde!" descem-na. Se chegar a zero, a música para e aparece "Falhaste!", com a parte da música que tocaste, sem estrelas nem recorde. Com a vida baixa, os bordos do ecrã pulsam a vermelho.
- As falhas e os toques errados também gastam energia; com a energia ativa, cada falha corta-lhe 1 segundo.
- Durante a partida aparecem as notas acertadas e falhadas; o resultado mostra também as acertadas, as falhadas e o combo máximo.
- Na Noite, o tapete de acordes passa a ser um coro, mais leve: o som anterior acumulava graves ao lado do contrabaixo e soava abafado.

## [3.2.0] — 2026-10-01

- A app passa a estar também em inglês. Na primeira visita segue a língua do navegador; muda-se no botão da língua do cabeçalho (sempre à vista), no link do ecrã inicial ou em ⚙ › Aspeto › Idioma, e a escolha fica guardada.
- Em inglês as notas e os acordes usam letras (C, D, E… e "G7", "Dm", "Cmaj7"); em português continuam em solfejo (Dó, Ré, Mi… e "Sol 7").
- Só se descarrega a língua em uso, e funciona sem rede depois da primeira vez.
- A pesquisa de instrumentos encontra o nome em português e na língua atual.

## [3.1.0] — 2026-10-01

- O polegar toca ao dobrar (para dentro da palma) ou ao mover-se para baixo, depressa e em relação à mão, em vez de encostar ao lado do indicador. Funciona com a mão rodada ou inclinada; para cima ou para fora não toca, e subir o polegar e voltar ao sítio também não.
- É um toque: a nota solta quando o polegar para. Com outro dedo da mesma mão a tocar, o polegar precisa de um movimento maior.
- Os polegares deixam de precisar de calibração e de aprender; "Calibrar mãos" já não pede o polegar afastado nem encostado.

## [3.0.0] — 2026-10-01

Interface redesenhada com revelação progressiva, pensada primeiro para o telemóvel e o tablet. Todas as funcionalidades continuam; o desenho das mãos e das notas não muda.

- Ecrã inicial com um só botão (▶ Começar), a privacidade numa linha e "Sem câmara? Tocar no ecrã". Se a câmara falhar, um cartão oferece tentar outra vez ou tocar no ecrã.
- A tocar: o palco ocupa o ecrã, o HUD fica só com a nota (e a gravação e o looper quando há) e o cabeçalho tem teclado no ecrã, ecrã inteiro, gravar e definições.
- Duas pills (instrumento, tónica · escala) abrem uma folha com 4 tabs: Som, Notas, Efeitos e Estúdio. Em baixo no telemóvel (arrasta-se para expandir ou fechar), à direita em paisagem e no desktop; não escurece nem encolhe o palco, por isso continuas a tocar enquanto mexes. Teclas `1`–`4` abrem cada tab.
- "Cada dedo toca…" numa tira de acesso rápido: no telemóvel abre pela 3.ª pill, em ecrãs largos está sempre à vista. Na tab Notas, cartões com a explicação do modo e a pré-visualização dos acordes de cada dedo.
- Instrumentos em cartões por família; as escalas mostram as 5 mais usadas e "+ mais"; tónica e oitava base em pills.
- As predefinições passam a "Sons guardados" na tab Som (tocar carrega; guardar e apagar ali mesmo). Efeitos com o da boca em destaque e "Repor efeitos".
- Dicas do primeiro uso, uma de cada vez (mostra as mãos, dobra um dedo, abre a boca), que não voltam depois de cumpridas.
- Ao parar uma gravação, o aviso "Ver" abre o Estúdio.
- Definições arrumadas por tarefa (Mãos, Câmara, Som, Aspeto); ecrã inteiro no telemóvel. Novo: "Mostrar FPS" (o FPS deixa de estar sempre no HUD) e silenciar nas definições.
- Alvos de toque de 44 px e margens seguras (notch) no telemóvel.

## [2.3.0] — 2026-10-01

- O polegar toca ao encostar ao lado do indicador (como quem carrega num botão) e solta ao afastar, em vez de dobrar como os outros dedos. A medida é relativa à própria mão, por isso não muda ao rodar, inclinar ou afastar a mão da câmara.
- O polegar não toca quando é o indicador que dobra e vem ter com ele, nem quando a mão entra já com o polegar encostado.
- A medida do polegar tem em conta a proporção do vídeo (16:9), e o polegar em repouso não toca sozinho nem fica preso: solta ao voltar perto do repouso, precisa de subir de verdade e a aprendizagem só o torna menos sensível.
- "Calibrar mãos" pede o polegar afastado e depois encostado ao lado do indicador; a aprendizagem da mão passa a incluir os polegares (10 barrinhas nas Definições com os polegares ligados).
- A calibração e o aprendido dos polegares guardados eram da medida antiga e são esquecidos (só os dos polegares).

## [2.2.0] — 2026-09-30

Deteção dos dedos mais rápida e mais fácil, sobretudo no anelar e no mindinho.

- A app aprende a tua mão enquanto tocas: o intervalo de cada dedo (esticado a dobrado) ajusta os limiares sozinho e fica guardado para a próxima vez. Liga e desliga em Definições → Mãos; "Repor calibração" esquece também o aprendido.
- Anelar e mindinho tocam com menos dobra; uma dobra decidida toca antes de chegar ao fim; um período curto depois de soltar evita repetir a nota com o tremor.
- Resposta mais rápida nas dobras médias e fracas (até 2 fotogramas a menos); nas dobras rápidas fica como antes, para um salto da deteção nunca tocar sozinho.
- Câmara pedida a 640×360 e 30 fps (a resolução baixa passa a 480×270); o overlay e a gravação de vídeo continuam a 1280 de largura.
- A deteção da boca só corre com um efeito da boca escolhido, e nunca no mesmo fotograma que as mãos.

## [2.1.0] — 2026-09-30

- Nome Handagio, com "Vision Sound Cam" como descritivo. As preferências e gravações guardadas com o nome antigo não passam para a versão nova.
- O palco ocupa todo o ecrã (também em tablet em paisagem), com margens mínimas; as mãos enchem-no sem deformar, seja qual for a proporção da câmara.

## [2.0.0] — 2026-09-30

Interface redesenhada para pôr o foco em tocar, e instrumentos acústicos gravados. A deteção dos dedos não muda; a mão esquerda e a direita passam a reconhecer-se pela lateralidade do MediaPipe.

- Palco em primeiro plano, com uma barra de controlo e gavetas no lugar das três colunas e dos separadores.
- Ecrã inteiro (`E`) e esconder interface (`I`), com a barra a espreitar ao mexer o rato.
- O palco mostra sempre só as mãos (a pessoa não aparece, nem na gravação); ondas sempre por baixo do palco, mais leves.
- Um só visualizador (ondas sobrepostas); os canvases fora do ecrã deixam de desenhar.
- "Cada dedo toca…" à mão: coluna à esquerda do palco com Uma nota, Oitava, Quinta, Acorde, Suspenso, Sétima e Nona, cada uma com um desenho e a explicação numa dica; tecla `C` e menu ⋯ no telemóvel.
- Limitador de segurança à saída: muitos dedos com acordes já não saturam.
- Seletor de instrumentos com pesquisa e grupos por família; `,` e `.` mudam de instrumento.
- Efeitos num rodapé por baixo do palco, cada um com o nome (Reverb, Eco, Filtro, Drive, Pitch e o efeito da boca com o medidor), e em cartões na gaveta Efeitos (no telemóvel e em janelas baixas, pelo menu ⋯).
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

[2.3.0]: https://github.com/zealves/handagio/releases/tag/v2.3.0
[2.2.0]: https://github.com/zealves/handagio/releases/tag/v2.2.0
[2.1.0]: https://github.com/zealves/handagio/releases/tag/v2.1.0
[2.0.0]: https://github.com/zealves/handagio/releases/tag/v2.0.0
[1.0.0]: https://github.com/zealves/handagio/releases/tag/v1.0.0
