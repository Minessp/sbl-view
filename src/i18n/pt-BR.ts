/**
 * Textos de interface, PT-BR. A voz: técnica, direta, sem promessa.
 * Novo idioma = novo arquivo com o mesmo tipo (`Strings`).
 */
const ptBR = {
  meta: {
    name: 'SBL View',
    tagline: 'Atlas de biomecânica para quem treina',
  },
  nav: {
    atlas: 'Atlas',
    library: 'Exercícios',
    lab: 'Lab',
    training: 'Treino',
    skip: 'Pular para o conteúdo',
    search: 'Buscar no site (Ctrl+K)',
    menu: 'Menu',
    menuOpen: 'Abrir o menu',
  },
  page: {
    notFound: 'Página não encontrada',
    notFoundLead: 'Este endereço não leva a nenhuma página do SBL View. Talvez o link esteja quebrado ou a página tenha mudado de lugar.',
    notFoundHome: 'Voltar para o início',
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
  home: {
    title: 'Veja o músculo trabalhar',
    lead: 'Um corpo anatômico em 3D para entender o treino: onde cada músculo se prende, quando ele alonga ou encurta em cada exercício, quanto torque o agachamento pede e como montar a semana. Cada número traz a fonte e o grau de confiança.',
    hintFine: 'Passe o cursor pelo corpo: a lente tira a pele. Clique num músculo para abrir no Atlas. Arraste para girar.',
    hintCoarse: 'Toque no corpo: a lente tira a pele. Toque de novo no mesmo músculo para abrir no Atlas. Arraste para girar.',
    viewer: 'Corpo anatômico interativo',
    keys: 'Setas giram o corpo. Enter abre no Atlas o que está no centro da lente. 1, 2 e 3 escolhem a profundidade da lente.',
    lens: { label: 'Profundidade da lente', superficial: 'Músculo', deep: 'Profundo', bone: 'Osso' },
    open: (name: string) => `${name}: abrir no Atlas`,
    entries: 'Por onde começar',
    doors: {
      atlas: { name: 'Atlas', body: 'Cada músculo, camada por camada: origem, inserção e ação' },
      library: { name: 'Exercícios', body: 'Animados, com o comprimento de cada alvo na repetição' },
      lab: { name: 'Lab', body: 'Comprimento, carga e torque, exercício contra exercício' },
      training: { name: 'Treino', body: 'Divisão, sessão ao vivo, recordes e análise' },
    },
    cue: 'Role para abrir as camadas',
    explode: {
      title: 'Quatro camadas, um corpo',
      body: 'Pele, músculo superficial, músculo profundo e osso, lado a lado. No Atlas cada camada liga, desliga ou vira fantasma, e qualquer estrutura se isola.',
    },
    layers: { skin: 'Pele', superficial: 'Músculo superficial', deep: 'Músculo profundo', bone: 'Osso' },
    loading: 'Montando o corpo',
  },
  stage: {
    failed: 'Não deu para baixar o corpo anatômico. Confira a conexão e tente de novo.',
    retry: 'Tentar de novo',
  },
  /** Link para a mesma página no outro idioma: o texto já vem na língua de destino. */
  lang: {
    other: 'English',
    otherLabel: 'View this page in English',
  },
} as const;

export type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : { readonly [K in keyof T]: Widen<T[K]> };
export type Strings = Widen<typeof ptBR>;

export default ptBR;
