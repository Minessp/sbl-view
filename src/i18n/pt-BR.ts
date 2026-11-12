/**
 * Textos de interface, PT-BR. A voz: técnica, direta, sem promessa.
 * Novo idioma = novo arquivo com o mesmo tipo (`Strings`).
 */
export const ptBR = {
  meta: {
    name: 'SBL View',
    tagline: 'Atlas de biomecânica para quem treina',
  },
  nav: {
    label: 'Navegação principal',
    home: 'Abertura',
    system: 'Sistema',
    skip: 'Pular para o conteúdo',
  },
  theme: {
    label: 'Tema',
    system: 'Auto',
    light: 'Papel',
    dark: 'Ardósia',
  },
  evidence: {
    label: 'Grau de evidência',
    estabelecido: 'Estabelecido',
    provavel: 'Provável',
    especulativo: 'Especulativo',
    hypothesis: 'Hipótese',
    unverified: '[a verificar]',
    describe: {
      estabelecido: 'Consenso sustentado por vários estudos ou medição direta.',
      provavel: 'Apoiado por evidência, com lacunas ou extrapolação.',
      especulativo: 'Raciocínio biomecânico plausível, sem teste direto.',
    },
  },
  opening: {
    plate: 'Prancha I',
    title: 'O corpo em camadas',
    lead: 'Role para baixo. Um plano de corte desce pelo corpo e tira uma camada por vez. No fim sobra a alavanca.',
    cutLabel: 'Plano de corte',
    cutUnit: 'cm',
    layers: {
      skin: {
        name: 'Pele',
        body: 'A forma que aparece no espelho. Mostra volume, mas esconde o que importa para o treino: onde cada músculo se prende e por onde passa.',
      },
      superficial: {
        name: 'Músculo superficial',
        body: 'Cada fuso é um músculo desenhado como linha de ação, da origem à inserção. Quando a articulação gira, essa linha encurta ou alonga, e a força que o músculo consegue produzir muda junto.',
      },
      deep: {
        name: 'Músculo profundo',
        body: 'Por baixo ficam músculos que quase não aparecem e trabalham em quase todo agachamento, remada ou rosca: vasto intermédio, sóleo, glúteo médio, braquial.',
      },
      bone: {
        name: 'Osso',
        body: 'As alavancas. O ângulo entre o segmento e a linha da carga decide quanto torque o músculo precisa vencer em cada ponto do movimento. É isso que o Lab vai calcular.',
      },
    },
    end: {
      title: 'Próximas pranchas',
      lab: 'Agachamento no Lab',
      labStatus: 'Em construção',
      system: 'Ver o sistema visual',
    },
    note: 'Geometria ilustrativa: os caminhos musculares desta prancha foram desenhados à mão e não servem como medida. Números do Lab virão de modelos publicados, sempre com fonte e grau de confiança ao lado.',
    loading: 'Montando o corpo',
  },
  fallback: {
    title: 'Este navegador não desenhou o 3D',
    body: 'O WebGL não está disponível. Abaixo, o mesmo esqueleto em vista frontal, calculado pelo mesmo motor.',
    figure: 'Esqueleto simplificado em vista frontal: cabeça, tronco, pelve, braços e pernas como segmentos retos.',
  },
  system: {
    title: 'Sistema visual',
    lead: 'Uma prancha anatômica que se comporta como instrumento de laboratório. Papel vegetal ou ardósia, nanquim e um único acento: eosina, o corante que deixa o músculo rosa no microscópio.',
    color: 'Cor',
    colorNote: 'Um acento só. Tudo que é ativo, selecionado ou carregado de dado usa eosina; o resto é tinta e papel.',
    stain: 'Rampa de coloração',
    stainNote: 'Volume semanal e ativação usam a mesma rampa, como intensidade de coloração em lâmina.',
    type: 'Tipo',
    typeNote: 'Archivo varia de largura para codificar densidade: condensada em tabela, expandida em leitura grande. Newsreader em itálico guarda a nomenclatura.',
    space: 'Espaço',
    line: 'Traço',
    lineNote: 'Variações num gráfico se distinguem por padrão de linha, não por cor.',
    seals: 'Selos de evidência',
    motion: 'Movimento',
    motionNote: 'Rápido para resposta ao toque, médio para troca de estado, lento só para a câmera.',
    contrast: 'contraste',
  },
} as const;

type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> };
export type Strings = Widen<typeof ptBR>;
