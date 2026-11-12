# SBL View

Atlas 3D de biomecânica para quem treina. Mostra como o comprimento do músculo, o ângulo da articulação
e a linha da carga se encontram em cada exercício, com fonte e grau de confiança ao lado de cada número.

Site estático, gratuito, sem conta e sem servidor: tudo roda no navegador e os dados ficam no aparelho.
Interface em português do Brasil.

> O modelo é uma estimativa, não uma medição do seu corpo. Atividade em EMG não prova hipertrofia.
> Nada aqui é orientação médica.

## O que tem

- **Atlas:** corpo anatômico em camadas (pele, músculo, osso), com origem, inserção, ações e curva de comprimento
  por ângulo de cada músculo.
- **Exercícios:** biblioteca com animação 3D de cada execução, músculos-alvo e ênfase de comprimento.
- **Lab:** agachamento com solver estático, momentos articulares e variações lado a lado.
- **Treino:** divisões, plano, sessão ao vivo, histórico, recordes, análise de volume e mapa de calor no corpo.

## Rodar

Requer Node 22 ou mais novo.

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # lint + tipos + testes + build (o mesmo que o CI)
```

## Estrutura

```
src/engine/    motor biomecânico puro (sem React nem three.js), testado com Vitest
src/data/      dados (esqueleto, músculos, exercícios, referências) e schemas Zod
src/scene/     palco WebGL (React Three Fiber), carregado sob demanda
src/features/  telas: início, atlas, exercícios, lab, treino
src/ui/        tokens de design, base e componentes
src/i18n/      textos de interface
src/storage/   IndexedDB, backup e mescla
```

## Evidência

Cada número do banco traz fonte e grau de confiança (`estabelecido`, `provavel` ou `especulativo`). Referências
ainda não conferidas na fonte primária aparecem na interface como "[a verificar]". A lista completa está em
`src/data/references.json`; ajuda para conferir é bem-vinda (veja [`CONTRIBUTING.md`](./CONTRIBUTING.md)).

## Publicação

Site estático: qualquer hospedagem de arquivos serve, sem segredo nem variável obrigatória.

- **Cloudflare Pages:** build `npm run build`, saída `dist`, variável `NODE_VERSION=24`. `public/_headers` define
  cache, CSP e cabeçalhos de segurança; sem `404.html`, o Pages serve o `index.html` em qualquer rota.
- **Outro caminho de base** (ex.: GitHub Pages): `BASE_PATH=/<repo>/ npm run build` e copiar `dist/index.html`
  para `dist/404.html`.

Antes de publicar: `npm run check` e, com `npx vite preview` no ar, `node scripts/smoke.mjs http://localhost:4173`
e `node scripts/a11y.mjs http://localhost:4173`.

## Licença

Gratuito e de código aberto para uso **não comercial**, com atribuição obrigatória.

- Código: PolyForm Noncommercial 1.0.0 ([`LICENSE`](./LICENSE)).
- Dados e textos: CC BY-NC-SA 4.0.
- Modelo anatômico derivado do Z-Anatomy: CC BY-SA 4.0.

Detalhes e o que cada licença cobre em [`LICENSE-CONTENT.md`](./LICENSE-CONTENT.md). Terceiros em
[`ATTRIBUTION.md`](./ATTRIBUTION.md).

Copyright (c) 2026 Minessp.
