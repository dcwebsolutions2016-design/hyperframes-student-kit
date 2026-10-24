# Look builder

Um assistente local de 7 passos para escolher o visual de um vídeo **em cima do seu próprio clipe**
antes de pedir a edição ao Claude. Inspirado no "Look builder" que a criadora Zee mostrou no Instagram:
em vez de ler DESIGN.md e registry.json, você vê cada opção renderizada sobre um frame da sua gravação,
clica em "Escolher" ou "Mais como essa", e no fim salva um `look.json` que as skills do kit leem.

Cada opção vem de uma skill ou estilo deste kit: `reel-oney`, `reel-editorial-oney`, `anuncios-oney`,
`video-colagem-oney`, `reel-explicativo-oney`, `vsl` (roxo, laranja, clean) e `style-library`
(`02-kallaway`, `01-vox-explainer`). As regras de "o que não fazer" de cada DESIGN.md viram avisos de conflito.

## Como usar

```bash
npm run look-builder
```

Abra <http://localhost:8765/>. Para começar já com um clipe:

```bash
node tools/look-builder/server.mjs --clip "video-projects/meu-reel/assets/raw.mp4"
```

1. **Clipe**: escolha um vídeo listado (`video-projects/*/assets`, `meus-videos/`, `raw-media/`) ou cole um caminho.
   Dê Play/Pause: o frame em que você pausar vira o fundo de todos os cards.
2. **Guias**: arraste "Topo da cabeça" e "Legenda (topo)". Tudo acima da cabeça e as legendas se posicionam por aí.
3. **Texto de exemplo**: edite o gancho, a frase das legendas, a palavra-chave e o @, ou use
   "Usar a transcrição do projeto" (lê `assets/transcript.json` ou `assets/raw.json`).
4. **Passos 1 a 6**: Cores → Fontes → Gancho → Legendas → Elementos → Motion. Cada passo usa o que você já escolheu.
   "Começo rápido" aplica um preset inteiro (um look pronto de uma skill); dá para mudar qualquer peça depois.
   "Mais como essa" anota um pedido de variação para o Claude, sem quebrar o fluxo.
5. **Revisão**: confira, escolha (ou aceite) a skill executora, leia os conflitos, escreva notas,
   e **Salvar look.json** grava em `video-projects/<slug>/look.json` e copia um prompt pronto.
6. Cole o prompt no Claude Code. As skills Oney leem o `look.json` (regra em `.claude/skills/_perfil-oney.md`).

## Legenda Dinâmica (EffectCraft)

Se a pasta `C:\Users\<voce>\Desktop\EFEECTCRAFT EDITOR CLAUDE\catalogo` existir (ou `LDS_CATALOG=<pasta>` apontar
para uma pasta com `data.json` + `gifs/`), o passo **Legendas** ganha os 14 "prontos" do Legenda Dinâmica Studio
com os GIFs reais do catálogo, e o passo **Motion** passa a oferecer as 24 entradas quando um pronto está escolhido.
No palco à esquerda a legenda dinâmica aparece como aproximação (palavra-chave grande, conectivos pequenos, entrada
palavra por palavra) nas suas cores. O `look.json` grava `captions.engine = "legenda-dinamica-studio"` com pronto,
modelo, entrada e saída, e o prompt pede a legenda via skill `/legenda` no EffectCraft enquanto o resto do look
é montado no HyperFrames. Sem a pasta, o passo funciona só com as legendas HTML do kit.

## Testar de verdade

O preview do wizard é HTML/GSAP no navegador. O botão **▶ Testar de verdade** (rodapé) monta uma composição
HyperFrames real a partir do look atual em `video-projects/<slug>/look-test/` (um trecho de 8 s do clipe a partir
do tempo atual do player, copiado sem reencodar, as fontes das skills e um `index.html` com uma timeline GSAP
pausada registrada em `window.__timelines`) e roda `hyperframes snapshot` nos instantes do gancho, das legendas e
de cada entrada de elemento. Os PNGs aparecem numa galeria no próprio Look builder, com link para abrir em tamanho
real. Leva cerca de um minuto no primeiro uso (o HyperFrames sobe o navegador de render). O `look-test/` pode ser
apagado a qualquer momento; o `index.html` gerado também serve de ponto de partida para a skill, pois usa os
mesmos renderizadores de `looks.mjs` (`testbuild.mjs` serializa as funções `anim` para dentro da página).

## Atalhos e rascunho

← → mudam de passo, 1–9 escolhem o card, espaço dá play/pause, Esc fecha "Mais como essa". O rascunho é salvo
sozinho no navegador por clipe e restaurado ao reabrir; se o projeto já tem `look.json`, ele é carregado.
"🎲 Surpreenda-me" monta um look coerente de uma skill ao acaso. "Limpar" zera tudo.

## O que vai no look.json

```json
{
  "clip": "…/assets/raw.mp4", "orientation": "9:16", "canvas": {"width":1080,"height":1920},
  "framing": {"headTop": 620, "capTop": 1150},
  "preset": "editorial", "skill": "reel-editorial-oney", "skillCommand": "/reel-editorial-oney",
  "colours": {"id":"butter","acc":"#f4e27c", "...": "…"}, "fonts": {"id":"inter-serif", "...": "…"},
  "hook": {"id":"serif-stack"}, "captions": {"id":"one-word-lower"},
  "elements": [{"id":"print-card"}, {"id":"handwritten-note"}], "motion": [{"id":"blur-rise"}, {"id":"punch-in"}],
  "sampleText": {"...": "…"}, "extras": [{"step":"fonts","base":"inter-serif","ask":"mais fina"}],
  "notes": "…", "conflicts": []
}
```

Ao lado é gravado `LOOK.md`, a mesma coisa em prosa. `video-projects/` é gitignorado, então ambos ficam privados
junto com o seu vídeo.

## Estender

- `looks.mjs` é o catálogo. Para uma opção nova, adicione um objeto com `id`, `name`, `desc`, `skills`
  (onde ela é nativa) e um `render(S)` que escreve HTML em pixels de 1080 (ou 1920) de largura; `S.v` são as
  cores, `S.font` as fontes, `S.headTop`/`S.capTop` o enquadramento, `S.text` o texto de exemplo.
- `CONFLICTS` em `looks.mjs` traduz os "What NOT to do" de cada DESIGN.md. Se mudar uma skill, atualize ali.
- Fontes: o servidor serve `/fonts/<arquivo>` procurando nas pastas `template/fonts` das skills. Anton, Bebas,
  Fraunces, Archivo e Playfair vêm do Google Fonts (precisa de internet só para esses).

O preview é uma aproximação em HTML/GSAP para decidir o look. A edição real continua sendo feita pela skill
com HyperFrames, snapshots e render, como sempre.

## Detecção da cabeça

Ao abrir um clipe (sem rascunho salvo) o Look builder roda o MediaPipe Face Detector no próprio navegador em
4–9 frames espalhados pelo vídeo, fica com o maior rosto de cada frame e estima o topo da cabeça (cabelo acima da
caixa do rosto) e o queixo. Os sliders "Topo da cabeça" e "Legenda (topo)" já vêm preenchidos e um retângulo verde
mostra o rosto detectado. O botão "Detectar cabeça" refaz; a caixa "automático ao abrir um clipe" desliga a
detecção automática. Precisa de internet na primeira vez (modelo e wasm vêm do CDN e ficam em cache). Vídeos sem
rosto (animações, telas) caem no aviso "Nenhum rosto encontrado" e você ajusta à mão.

## Cards de preset

No passo 1, "Começo rápido" mostra cada preset como um card com uma miniatura do seu clipe e o gancho nas cores e
fontes daquele look. Se quiser ilustrações geradas (por exemplo no ChatGPT), siga
`assets/presets/PROMPT-CHATGPT.md`: salve `celular.png`, `editorial.png`, … em `assets/presets/` e a interface passa
a usá-las no lugar da miniatura desenhada.
