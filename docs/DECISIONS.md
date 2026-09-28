# Decisões

Registo das decisões tomadas quando o pedido era ambíguo. A mais recente fica no fim.

1. **Mockup em `.webp`.** O prompt refere `reference/mockup.png`, mas o ficheiro existente é `reference/mockup.webp`. Usei esse.
2. **Versões.** React 18 (pedido), Vite 8, Vitest 5, ESLint 9 (flat config) com typescript-eslint 8 e TypeScript 5.9. Fiquei no ESLint 9 e no TS 5.x por compatibilidade com o typescript-eslint.
3. **Modelos e WASM fora do git.** `public/mediapipe/` está no `.gitignore`. `npm run fetch-models` copia o WASM de `node_modules/@mediapipe/tasks-vision/wasm` (sem rede) e descarrega os dois `.task` do Google Storage. Corre sozinho em `predev` e `prebuild` e salta ficheiros que já existem.
4. **Espelho das coordenadas.** O protótipo usava `@mediapipe/hands` com `selfieMode: true`, que já devolvia os pontos em espelho. O `tasks-vision` não tem essa opção: os pontos chegam na imagem original e o `handTracker`/`faceTracker` convertem `x → 1 − x` à entrada. Assim, todas as fórmulas do protótipo (atribuição esquerda/direita pelo pulso, colunas do modo movimento, overlay) ficam iguais e o canvas de overlay não precisa de espelho.
5. **Fontes.** `@fontsource/sora` para títulos e `@fontsource/inter` para texto, só o subconjunto latino para poupar peso.
6. **Ecrã inicial.** Aparece por cima do palco (e não como página separada), para o utilizador já ver o layout. O `AudioContext` só é criado no clique em "Ligar câmara e som" ou na primeira tecla tocada.
7. **Preferências.** Guardadas com o middleware `persist` do Zustand (`localStorage`, chave `vision-sound-cam:prefs`). Só as preferências são persistidas; o estado de execução (vista, gravação, estado da câmara) não.
8. **Graus com polegares.** O protótipo dava aos dedos da mão esquerda os graus `(4 − j) − n` (n = notas da escala), o que só é contínuo na pentatónica. O prompt pede graus seguidos sem saltos, por isso uso `(4 − j) − 5`: os 10 dedos ficam em -5..4 em qualquer escala e o resultado é igual ao do protótipo na pentatónica, que é a escala por defeito.
9. **Calibração.** Com calibração, o limiar de disparo de cada dedo fica a 60% do caminho entre a dobra "esticado" e "dobrado" medida, e a sensibilidade continua a deslocá-lo (0.55 é neutro). A libertação fica 0.18 abaixo, mas nunca abaixo de 15% do caminho. Sem calibração válida (diferença < 0.2) usa-se a fórmula do protótipo.
