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
    notFound: 'Página não encontrada',
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
    label: 'Tema claro',
  },
  opening: {
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
        body: 'Cada músculo tem uma linha de ação, da origem à inserção. Quando a articulação gira, essa linha encurta ou alonga, e a força que o músculo consegue produzir muda junto.',
      },
      deep: {
        name: 'Músculo profundo',
        body: 'Por baixo ficam músculos que quase não aparecem e trabalham em quase todo agachamento, remada ou rosca: peitoral menor, ilíaco, adutor curto, vasto intermédio.',
      },
      bone: {
        name: 'Osso',
        body: 'As alavancas. O ângulo entre o segmento e a linha da carga decide quanto torque o músculo precisa vencer em cada ponto do movimento. É isso que o Lab vai calcular.',
      },
    },
    end: {
      title: 'Para onde ir',
      lab: 'Agachamento no Lab',
      labStatus: 'Carga, ângulo e torque',
      atlas: 'Atlas dos músculos',
      atlasStatus: 'O que cada um faz',
      library: 'Biblioteca de exercícios',
      libraryStatus: 'Filtre por comprimento',
      system: 'Ver o sistema visual',
    },
    note: 'Malha anatômica do Z-Anatomy (CC BY-SA 4.0), simplificada; as linhas de ação saem dela e são estimativa, não medida. Os números do Lab vêm de modelos publicados, sempre com fonte e grau de confiança ao lado.',
    loading: 'Montando o corpo',
    deckFinale: 'Quatro camadas',
    deckOf: 'de',
  },
} as const;

export type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : { readonly [K in keyof T]: Widen<T[K]> };
export type Strings = Widen<typeof ptBR>;
