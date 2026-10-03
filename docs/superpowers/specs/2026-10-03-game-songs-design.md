# Músicas escritas à mão para os níveis 2 e 3

No ramo `feat/game-mode`, depois da v5 (decisão 71).

O feedback do utilizador sobre os níveis 2 e 3: "o instrumento não é muito agradável de ouvir, a música parece fora do tempo e não tem alma nenhuma".

**As causas:**
- a melodia é um passeio aleatório, sem frases;
- o swing do Lo-fi, aplicado a uma melodia ao acaso, soa a atraso;
- o piano elétrico e o "Lead" estão entre os timbres menos agradáveis.

**Decidido com o utilizador:**
- melodias escritas à mão, um tapete de acordes, baixo e bateria escritos para cada música, sem swing e instrumentos mais agradáveis;
- o nível 1 (Pop) continua como está;
- os ids `lofi` e `electro` mantêm-se, porque estão no progresso guardado, e só os nomes mudam.

## Níveis

| Nível | id | Nome (pt / en) | Melodia | Tapete | Baixo | Kit | Escala, tónica | BPM |
|---|---|---|---|---|---|---|---|---|
| 2 | `lofi` | Noite / Night | `vibes` | `pad` | `contrabass` | `drums` (suave) | Dórica, Ré | 90 |
| 3 | `electro` | Neon / Neon | `pluck` | `pad` | `bass` | `tr808` | Menor, Lá | 112 |

- O swing passa a 0 nos dois.
- O nível 2 fica com a densidade do Médio e o 3 com a do Difícil (decisão 70). Mas numa música escrita à mão a densidade vem das próprias notas; a dificuldade passa a servir só para o tempo de chegada.

## Formato `Song`

Em `src/game/songs.ts` (puro):

```ts
interface SongNote { step: number; degree: number; dur: number } // step dentro da música (16 por compasso); grau 0..7
interface Song {
  bars: number;            // 16; a ronda toca-a duas vezes (32 compassos)
  melody: SongNote[];      // graus da escala a partir da tónica, 0..7 (8 faixas)
  chords: number[];        // grau da fundamental do acorde, um por compasso (bars entradas)
  bass: SongNote[];        // linha de baixo escrita (graus, uma oitava abaixo)
  drums: { verse: DrumHit[]; chorus: DrumHit[]; chorusBars: number[] }; // compassos-padrão
}
interface DrumHit { step: number; slot: number; vel: number } // step dentro do compasso (0..15)
```

A bateria escreve-se como dois compassos-padrão por música, "verso" e "refrão". `chorusBars` diz que compassos usam o refrão. Cada música tem o seu groove.

- **Melodia:** forma A A' B A' em frases de 4 compassos, com pergunta e resposta e notas longas nos fins de frase. Na maior parte, semínimas e colcheias, com no máximo 2 colcheias seguidas, para a câmara conseguir (decisão 69).
- **Tapete de acordes:** um evento por compasso, com a tríade do acorde (graus `c`, `c + 2`, `c + 4`) no instrumento `pad`, com volume baixo e a duração do compasso.
- **Fim:** o último compasso da segunda passagem acaba na tónica, com o prato.

## Das notas escritas às faixas

- **Com 8 faixas**, a faixa `k` é o grau `k` (decisão 68): a melodia sai exata.
- **Com menos faixas**, o grau `d` passa para a faixa `round(d × (lanes − 1) / 7)`. Mantém-se o desenho da melodia, e as notas são as das faixas que o jogador tem.
- **Depois aplicam-se as regras de sempre:**
  - mãos alternadas para as notas a menos de 1 tempo;
  - 0,30 s por mão;
  - 1 tempo na mesma faixa;
  - a final na tónica.

  Estas regras podem mexer em poucas notas quando há poucos dedos. Com 8 dedos não mexem em nenhuma: as músicas escrevem-se para isso, e um teste confirma.

## Acompanhamento

- `BackingEvent` ganha `{ kind: 'pad'; step; degrees: number[]; dur; vel }`.
- A sessão toca o tapete no instrumento `style.pad`, na oitava da melodia, e corta-o ao fim de `dur`.
- O baixo e a bateria saem da `Song`, e não dos padrões gerados.
- A entrada (os choques) e o último compasso mantêm-se.

## Testes

- **As músicas:**
  - os graus estão em 0..7;
  - os passos estão dentro da música;
  - `chords` tem `bars` entradas;
  - a melodia, mapeada para 8 faixas, cumpre 0,30 s por mão e 1 tempo na mesma faixa, sem precisar de remover notas;
  - acaba na tónica.
- **O gerador com uma `Song`:**
  - o mapeamento para 4 e 6 faixas mantém o desenho (as notas que sobem continuam a subir ou a ficar);
  - a ronda tem 32 compassos e os eventos do tapete existem;
  - os invariantes de sempre.
- **Os instrumentos** (`vibes`, `pluck`, `pad`, `contrabass`) existem.
- **e2e:** os níveis 2 e 3 começam com `gameMelody` `vibes` e `pluck`.

## Decisão a registar

Decisão 72.
