# Contribuindo

Contribuições são bem-vindas. Três tipos fazem mais diferença:

1. **Conferir referências.** Em `src/data/references.json`, entradas com `"verified": false` precisam de alguém que
   abra a fonte primária, confira o número citado e informe página, tabela ou DOI.
2. **Dados.** Novo músculo, exercício ou faixa de referência. Todo número entra como `Sourced`:
   `value`, `source` (ids de `references.json`) e `confidence`:
   - `estabelecido`: consenso, vários estudos ou medição direta;
   - `provavel`: apoiado por evidência, com lacunas ou extrapolação;
   - `especulativo`: raciocínio biomecânico plausível, sem teste direto.
   Geometria desenhada à mão usa a referência `sbl_authored` e nunca pode ser `estabelecido` (há teste para isso).
3. **Código.** Antes de abrir um pull request, `npm run check` precisa passar.

## Regras

- Nenhuma referência inventada. Na dúvida, `verified: false` e uma explicação em `note`.
- `src/engine/` não importa React, three.js nem DOM: funções puras e testadas.
- Texto de interface fica em `src/i18n/`. Voz técnica e direta, sem promessa e sem alarmismo.
- Cores só em `src/ui/tokens.css`. O teste de contraste roda no CI.
- Sem asserção não nula (`!`): use `at()` e `must()` de `src/engine/math/arr.ts`.
- Estilo: aspas simples, linhas de até ~160 colunas. O projeto não usa Prettier.
- Asset, fonte, dado ou dependência de terceiro: atualize `ATTRIBUTION.md` no mesmo commit. Só entram licenças abertas
  e compatíveis com as do projeto.

## Fumaça e acessibilidade

Com o build servido (`npm run build && npx vite preview`):

```bash
node scripts/smoke.mjs http://localhost:4173
node scripts/a11y.mjs http://localhost:4173
```

Os scripts usam o Edge instalado no Windows (`PW_CHANNEL=chrome` para Chrome) e o Chromium do Playwright no CI.

## Licença das contribuições

Ao enviar uma contribuição, você a licencia nos mesmos termos da parte do projeto que ela altera (veja
[`LICENSE-CONTENT.md`](./LICENSE-CONTENT.md)) e declara ter o direito de fazê-lo.
