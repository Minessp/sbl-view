# Atribuições

Material de terceiros usado pelo SBL View, com autor, licença e modificações.

## Fontes tipográficas

| Fonte | Autor | Licença | Pacote |
|---|---|---|---|
| Archivo (variável, eixos wght e wdth, normal e itálico) | Omnibus-Type | SIL Open Font License 1.1 | `@fontsource-variable/archivo` |

Empacotada no build; nenhuma fonte é carregada de servidor externo.

## Modelo anatômico

**Z-Anatomy**, "Z-Anatomy - The libre 3D atlas of anatomy", Gauthier Kervyn e colaboradores, CC BY-SA 4.0,
https://github.com/Z-Anatomy/Models-of-human-anatomy (arquivo `Z-Anatomy.zip`, `Startup.blend`, commit
`dd72c25bb57e47f8baf0333c3a926fb4ec8172fd`). Derivado do **BodyParts3D 4.0** (© The Database Center for Life Science,
CC BY 4.0, https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html).

É o único corpo do site (Atlas, exercícios, Lab, mapa de calor, página inicial).

- **Arquivos derivados, sob CC BY-SA 4.0:** `public/models/anatomy-{lo,mid,hi,ultra}.bin`,
  `public/fallback/corpo-frente.webp`, `public/fallback/corpo-costas.webp` (corpo renderizado para navegadores sem
  WebGL), `public/posters/*.webp` (cartazes da biblioteca: o corpo executando cada exercício, com o equipamento) e
  `src/data/muscle-paths.json` (linhas centrais dos músculos).
- **Componentes excluídos:** o repositório de origem traz peças com licença própria, conferidas no `License.txt`:
  ouvido interno (Univ. de Dundee, CC BY-NC-SA 4.0), rim (Lissie Cowley, CC BY-NC 4.0), nervos cranianos (Univ. de
  Dundee, CC BY 4.0) e cérebro/substância branca (Univ. de Washington). Nenhuma delas é usada: a exportação lê apenas
  ossos, músculos, regiões da pele e discos intervertebrais. Ossículos do ouvido médio, etmoide e cartilagens nasais
  e laríngeas também ficam de fora.
- **Modificações:** apenas o lado direito e a linha média são armazenados (o esquerdo é espelhado no navegador);
  pele fechada (frestas soldadas, aberturas tampadas, regiões urogenital e anal removidas); coordenadas convertidas e
  escaladas para 1,75 m; quatro níveis de detalhe, simplificados com meshoptimizer ou densificados por subdivisão;
  pesos de skinning, linha central e vetor radial dos músculos calculados pelo projeto; posições quantizadas em
  16 bits e comprimidas com o codec do meshoptimizer.
- **Processo:** exportação por `tools/anatomy/export.py` (Blender), empacotamento por `scripts/anatomy-pack.mjs`,
  mapa objeto → id em `src/data/anatomy.json`. Os centros articulares de `src/data/skeleton.json` foram medidos nessa
  malha.

## Dados e referências científicas

A lista completa de referências e o estado de conferência de cada uma estão em `src/data/references.json`.
Referências ainda não conferidas na fonte primária aparecem na interface como "[a verificar]".

- **Massas e centros de massa segmentares:** de Leva (1996), tabela 4.
- **Proporções segmentares:** Winter (2009), a partir de Drillis e Contini (1966).
- **Origem, inserção e ações musculares:** descrição de livro-texto, com OpenStax *Anatomy and Physiology 2e*
  (CC BY 4.0, https://openstax.org/books/anatomy-and-physiology-2e) como fonte citada. Texto reescrito, não copiado.
- **Modelos musculoesqueléticos de referência:** Arnold et al. (2010), Holzbaur et al. (2005), Rajagopal et al.
  (2016). Arquivos de modelo do OpenSim/SimTK não são redistribuídos.

Braços de momento e comprimentos musculares saem do modelo geométrico do próprio site e são estimativas.

## Bibliotecas de runtime

| Biblioteca | Licença |
|---|---|
| React, react-dom | MIT |
| three.js | MIT |
| @react-three/fiber, @react-three/drei | MIT |
| meshoptimizer (decodificador) | MIT |
| Zustand | MIT |
| Dexie | Apache-2.0 |
| Lenis | MIT |
| Motion | MIT |
| Zod | MIT |
| d3-scale, d3-shape | ISC |
| lucide-react (ícones; o ícone `menu` do cabeçalho é copiado em linha, © Lucide Contributors) | ISC |
| wouter | Unlicense |
| GSAP (com ScrollTrigger) | Standard "No Charge" License, https://gsap.com/standard-license |

GSAP não é distribuído sob licença aberta; os termos da GreenSock/Webflow permitem uso gratuito, inclusive comercial.
É usado apenas no capítulo "Ao vivo" da página inicial, fora do pacote inicial do site.

## Ferramentas de build e teste

Não são enviadas ao navegador.

- Blender (GPL): exportação da malha anatômica.
- meshoptimizer (MIT): simplificação e codificação da malha.
- axe-core (MPL-2.0): auditoria de acessibilidade no CI.
- Vite, Vitest, TypeScript, ESLint, Playwright: build, testes e verificação.
