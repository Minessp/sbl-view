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
    atlas: 'Atlas',
    library: 'Exercícios',
    lab: 'Lab',
    training: 'Treino',
    system: 'Sistema',
    skip: 'Pular para o conteúdo',
  },
  page: {
    notFound: 'Prancha não encontrada',
    notFoundLead: 'Este endereço não leva a nenhuma página do SBL View. Talvez o link esteja quebrado ou a página tenha mudado de lugar.',
    notFoundHome: 'Voltar para a abertura',
    error: 'A página não carregou',
    errorLead: 'Pode ser falta de internet ou uma versão nova do site publicada enquanto esta aba estava aberta. Recarregar costuma resolver; seus registros ficam no aparelho.',
    reload: 'Recarregar',
  },
  pwa: {
    update: 'Nova versão do SBL View pronta.',
    reload: 'Atualizar',
    dismiss: 'Depois',
  },
  theme: {
    label: 'Tema',
    system: 'Auto',
    light: 'Papel',
    dark: 'Ardósia',
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
      labStatus: 'Prancha II',
      atlas: 'Atlas dos músculos',
      atlasStatus: 'Prancha III',
      library: 'Biblioteca de exercícios',
      libraryStatus: 'Prancha IV',
      system: 'Ver o sistema visual',
    },
    note: 'Geometria ilustrativa: os caminhos musculares desta prancha foram desenhados à mão e não servem como medida. Os números do Lab vêm de modelos publicados, sempre com fonte e grau de confiança ao lado.',
    loading: 'Montando o corpo',
  },
} as const;

export type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : { readonly [K in keyof T]: Widen<T[K]> };
export type Strings = Widen<typeof ptBR>;
