# Instrumentos com amostras reais

Data: 2026-09-29 · Ramo: `redesign/v2` · Depende de: redesenho v2 (já no ramo)

## Porquê

O utilizador diz que os instrumentos "parecem quase todos com o mesmo som". A investigação (medição do espectro e do envelope de cada patch no browser) mostrou quatro causas:

1. **O motor está correto.** Com a nota segura, os patches diferem: o centroide espectral vai de ~400 a ~1300 Hz.
2. **Ao tocar com os dedos, as diferenças perdem-se.** Um toque dura ~200 ms e o "largar" corta a nota com `rel` de 0,1 a 0,25 s. Violino, flauta, metais, sax e órgão ficam todos reduzidos ao mesmo "bip" de ~300 ms.
3. **Todos tocam na mesma oitava.** Baixo, violoncelo, flauta e sinos ficam na mesma zona.
4. **A síntese é do protótipo:** ondas simples (seno, triângulo, dente de serra) que soam a sintetizador.

Há também um bug herdado do protótipo. Os patches `glass` e `epiano` ligam um LFO ao ganho de saída. Ao largar, o `cancelScheduledValues` não desliga essa modulação e a nota continua a soar até ~5 s, com tremolo.

O utilizador escolheu **amostras reais** e confirmou que não quer ter de fornecer material.

## Objetivo

- Os instrumentos acústicos passam a tocar a partir de gravações reais e cada um soa claramente diferente dos outros.
- Chegam instrumentos novos que a biblioteca já traz. Acrescentar um instrumento passa a ser: preparar as amostras e criar uma entrada no catálogo.
- Continua a funcionar sem internet depois de o instrumento ser usado uma vez.
- Nada muda na forma de tocar: os dedos, o teclado, o looper, a quantização, a gravação e os presets ficam iguais.

### Fora do âmbito
- Percussão: os kits continuam sintetizados.
- Sintetizadores (Lead, Pad, 8-bit, Wobble, Laser) e theremin: continuam sintetizados.
- Várias camadas de velocidade: cada nota tem uma amostra só; a força do toque muda o volume e o brilho, não a amostra.

## Fonte das amostras

**Biblioteca:** [nbrosowsky/tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments). O código é MIT e as amostras são **CC-BY 3.0**. As amostras já vêm editadas (sem silêncio, normalizadas, afinadas) e cada ficheiro tem o nome da nota (`A4.mp3`, `Cs5.mp3`…).

**Origem por instrumento** (`sample-source-info.txt` da biblioteca):

| Amostras | Origem | Uso |
|---|---|---|
| piano, violin, contrabass, flute, french-horn, trumpet, trombone, tuba, bassoon, organ, harp, xylophone, clarinet | VSCO 2 Community (CC0) | sim |
| bass-electric, saxophone, guitar-electric | Karoryfer (livre) | sim |
| guitar-acoustic | Universidade de Iowa (livre) | sim |
| cello, guitar-nylon, harmonium | Freesound (licença por som) | **só se a licença de cada som for CC0 ou CC-BY**; confirmar e registar em `CREDITS.md`, caso contrário o instrumento fica de fora |

A atribuição (CC-BY 3.0) fica em `public/samples/CREDITS.md`, no README e nas Definições, numa secção "Créditos dos sons".

## Preparação das amostras (uma vez, com o resultado no repositório)

Os originais pesam ~300 KB por nota. É demais para a web.

Um script de desenvolvimento, `scripts/prepare-samples.mjs`, corre à mão e não entra no build. Para cada instrumento:

1. Descarrega as notas escolhidas do GitHub da biblioteca: cerca de uma a cada terceira menor, **6 a 8 notas por instrumento**, só no registo que o instrumento usa.
2. Descodifica o MP3 em Node (descodificador em WASM ou JS, sem `ffmpeg`, que não está instalado).
3. Converte para mono. Corta para a duração máxima do instrumento (instrumentos percutidos ou beliscados: a cauda natural até 3 s; sustentados: 3 s) com *fade-out* de 150 ms.
4. Codifica em MP3 a 80–96 kbps com um codificador em JS (por exemplo `lamejs`, como dependência de desenvolvimento).
5. Escreve `public/samples/<id>/<nota>.mp3` e `public/samples/manifest.json`, com as notas de cada instrumento e a duração de cada amostra.

**Meta:** ≤ 250 KiB por instrumento e ≤ 4 MiB no total. O resultado entra no git, para o CI e o deploy não precisarem de rede nem de ferramentas extra. O deploy passa a enviar `samples/`.

## Catálogo

| id (existente ou novo) | Nome | Amostras | Registo (oitavas face à base) | Tipo |
|---|---|---|---|---|
| `piano` | Piano | piano | 0 | percutido: deixa soar ao largar, com abafador de 0,4 s |
| `violin` | Violino | violin | 0 | sustentado |
| `cello` | Violoncelo | cello (se a licença permitir) ou contrabass | −1 | sustentado |
| `bass` | Baixo elétrico | bass-electric | −2 | beliscado |
| `contrabass` *(novo)* | Contrabaixo | contrabass | −2 | sustentado |
| `flute` | Flauta | flute | +1 | sustentado |
| `clarinet` *(novo)* | Clarinete | clarinet | 0 | sustentado |
| `sax` | Saxofone | saxophone | 0 | sustentado |
| `brass` | Trompete | trumpet | 0 | sustentado |
| `horn` *(novo)* | Trompa | french-horn | −1 | sustentado |
| `trombone` *(novo)* | Trombone | trombone | −1 | sustentado |
| `tuba` *(novo)* | Tuba | tuba | −2 | sustentado |
| `bassoon` *(novo)* | Fagote | bassoon | −1 | sustentado |
| `organ` | Órgão | organ | 0 | sustentado (em ciclo) |
| `harp` | Harpa | harp | 0 | beliscado |
| `guitar` *(novo)* | Guitarra acústica | guitar-acoustic | −1 | beliscado |
| `eguitar` *(novo)* | Guitarra elétrica | guitar-electric | −1 | beliscado |
| `xylophone` *(novo)* | Xilofone | xylophone | +1 | percutido |

- Os ids que já existem mantêm-se, para que presets, looper e recentes continuem a funcionar.
- Os patches sintetizados sem equivalente gravado continuam a existir (piano elétrico, cravo, caixa de música, pluck, coro, marimba, vibrafone, kalimba, sino, steel drum, copos de cristal, sintetizadores, theremin).
- Os patches sintetizados que passam a amostras (`piano`, `violin`, `cello`, `bass`, `flute`, `sax`, `brass`, `organ`, `harp`) deixam de aparecer no seletor. O código fica como reserva enquanto a amostra carrega (ver abaixo).
- **Ícones:** os instrumentos novos reutilizam o ícone da família, até haver ícones próprios.

## Motor de som

Em `src/audio/`, sem React:

- **`samples.ts`:**
  - carrega o `manifest.json`;
  - `loadInstrument(id)` faz `fetch` e `decodeAudioData` de todas as notas do instrumento em paralelo e guarda os buffers em memória;
  - estado por instrumento: `idle | loading | ready | error`;
  - um `emitter` para a UI;
  - só carrega quando o instrumento é escolhido, nunca todos no arranque.
- **`sampler.ts`, função `playSample(deps, inst, dest, freq, vel, pan, when)`:**
  - devolve a mesma interface `Voice` dos patches (`setFreq`, `release`, `kill`, `sustain`);
  - escolhe a amostra mais próxima em semitons e usa `playbackRate = freq / freqDaAmostra`; o `setFreq` (deslizar e pitch global) mexe no `playbackRate`;
  - o envelope de entrada tem um ataque curto (5 ms) para evitar cliques;
  - a velocidade controla o ganho (`0.15 + 0.85·vel`, como hoje) e um passa-baixo suave (`1500 + vel·12000` Hz), para a força do toque abrir o brilho;
  - **Largar:**
    - percutido ou beliscado: não corta; deixa a amostra acabar, com um abafador opcional (piano: 0,4 s);
    - sustentado: `release` com o `rel` do instrumento (0,15–0,4 s), **mas nunca antes de 250 ms depois do início**, para um toque curto ainda soar a violino ou flauta;
  - **nota segura mais tempo do que a amostra:** ciclo entre 45% e 90% da amostra, com `loopStart`/`loopEnd` (os instrumentos da biblioteca têm sustentação estável; aceita-se algum artefacto no ciclo).
- **`AudioEngine.noteOn`:**
  - com um instrumento de amostras e buffers prontos, usa `playSample`;
  - enquanto carrega, usa o patch sintetizado com o mesmo id, se existir, ou então fica em silêncio;
  - o resto (vozes, `noteOff`, glide, pitch, looper, gravação) não muda.
- **Registo:** cada instrumento tem `register` em oitavas, somado à oitava base. A lógica de dedos e escalas não muda.
- **Bug do LFO:** corrigir `glass` e `epiano`. O `release` e o `kill` desligam também o LFO que modula `K.out.gain`, por exemplo registando-o no kit e pondo o ganho do LFO a 0 no `release`. É um desvio consciente do protótipo, registado em `DECISIONS.md`.

## Interface

- **Seletor de instrumentos:**
  - os instrumentos com amostras mostram um pequeno indicador (por exemplo "gravado");
  - enquanto carregam, a fila e o chip da barra mostram um anel de progresso;
  - se falhar, mostram "Não foi possível carregar — tenta de novo", e o som continua a sair do sintetizado (se houver).
- **Definições:** secção "Créditos dos sons" com o texto de `CREDITS.md`, resumido e com ligação para o completo.
- Nada muda na barra nem nas gavetas.

## Sem internet e cache

- O service worker já guarda na cache, à primeira utilização, tudo o que não está na lista de pré-cache. As amostras de um instrumento ficam disponíveis sem internet depois de o usar uma vez.
- Não entram no pré-cache, para não descarregar ~4 MB na instalação.
- Limitação aceite: numa versão nova, a cache antiga é apagada e as amostras voltam a ser descarregadas quando o instrumento é usado.

## Regra do projeto

O `CLAUDE.md` diz "Fórmulas e valores de deteção/som vêm de `reference/maos-musicais.html`; não aproximar". Passa a dizer:
> "Fórmulas e valores de deteção e dos sons sintetizados vêm de `reference/maos-musicais.html`; não aproximar. Os instrumentos acústicos usam amostras em `public/samples/` (ver `CREDITS.md`)."

## Testes

- **Unit (Vitest, lógica pura):**
  - nome de nota ↔ midi (`Cs5` → 73);
  - escolha da amostra mais próxima;
  - `playbackRate`;
  - validação do `manifest`: cada instrumento tem notas, ficheiros e duração;
  - o registo soma à oitava;
  - o tempo mínimo de 250 ms antes do corte.
- **e2e:**
  - escolher Violino carrega as amostras (pedido de `samples/violin/*.mp3` com resposta 200) e o chip sai do estado "a carregar";
  - tocar uma nota produz som (RMS do analisador > 0);
  - o espectro do violino e o da flauta, tocados no mesmo tom, têm similaridade de cosseno **< 0,9**, o que torna mensurável o "não soam iguais";
  - depois de usar um instrumento, com a rede desligada, ele volta a tocar.
- **Medição:** repetir a sonda desta investigação (espectro e envelope de cada instrumento com toque de 200 ms) e registar em `DECISIONS.md` a similaridade média entre pares, antes e depois.

## Documentação

- `DECISIONS.md`: amostras reais (fonte, licenças, preparação, tamanhos), registo por instrumento, tempo mínimo antes do corte, correção do LFO e alteração da regra do `CLAUDE.md`.
- `CHANGELOG.md` [2.0.0]: instrumentos acústicos com gravações reais e os instrumentos novos.
- `README.md`: créditos dos sons e como acrescentar um instrumento com amostras (`scripts/prepare-samples.mjs` e entrada no catálogo).
