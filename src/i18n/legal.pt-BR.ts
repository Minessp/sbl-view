/**
 * Páginas legais e institucionais (Sobre, Termos, Privacidade, Licenças), PT-BR. Fora do dicionário das páginas:
 * só o chunk de `features/legal` carrega este arquivo.
 */
export type LegalBlock = string | { readonly list: readonly string[] } | { readonly table: { readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] } };

export interface LegalSection {
  readonly id?: string;
  readonly title: string;
  readonly blocks: readonly LegalBlock[];
}

export interface LegalDoc {
  readonly title: string;
  readonly lead: string;
  readonly sections: readonly LegalSection[];
}

export type LegalPage = 'about' | 'terms' | 'privacy' | 'licenses';

const STORAGE_ROWS = [
  ['IndexedDB, banco `sbl-view`', 'Séries, sessões, planos, medidas e preferências do Treino', 'Até você apagar em Treino → Dados'],
  ['localStorage `sbl-theme`', 'Tema claro, quando escolhido', 'Até trocar o tema'],
  ['localStorage `sbl-lod`', 'Qualidade do modelo 3D, quando escolhida em Ajustes', 'Até voltar ao automático'],
  ['localStorage `sbl-rest`', 'Cronômetro de descanso em andamento na sessão ao vivo', 'Até o descanso acabar'],
  ['sessionStorage `sbl-chunk-reload`', 'Marca de recarga depois de uma versão nova do site', 'Até fechar a aba'],
  ['Cache do navegador (service worker)', 'Arquivos do próprio site, para abrir sem internet', 'Até a próxima versão do site'],
] as const;

export const legal: { readonly updated: string; readonly others: string; readonly pages: Record<LegalPage, LegalDoc> } = {
  updated: 'Atualizado em 15 de novembro de 2026.',
  others: 'Outras páginas',
  pages: {
    about: {
      title: 'Sobre o SBL View',
      lead: 'Um atlas 3D de biomecânica para quem treina: o corpo anatômico, os exercícios animados e o motivo de cada escolha, com a fonte e o grau de confiança de cada número.',
      sections: [
        {
          title: 'O que é',
          blocks: [
            'O SBL View mostra onde cada músculo se prende, o que ele faz e como o comprimento dele muda ao longo de cada exercício. Junta um explorador do corpo (Atlas), uma biblioteca de exercícios animados, um laboratório de comparação (Lab) e um registro de treino que fica no seu aparelho.',
            'SBL quer dizer science-based lifting: treino guiado pela evidência publicada. Onde a evidência ainda não chegou, o site diz que é hipótese.',
          ],
        },
        {
          title: 'O que não é',
          blocks: [
            {
              list: [
                'Não mede o seu corpo. O modelo é um corpo de referência de 1,75 m; comprimentos, braços de momento e cargas são estimativas geométricas, não medições.',
                'Não é orientação médica, de fisioterapia nem prescrição individual de treino.',
                'Não usa EMG como prova de hipertrofia. Ativação elétrica do músculo e crescimento muscular são coisas diferentes.',
                'Não promete resultado. Os números servem para comparar tendências entre exercícios.',
              ],
            },
          ],
        },
        {
          id: 'evidencia',
          title: 'Como lemos a evidência',
          blocks: [
            'Todo número do banco traz a fonte e um selo de confiança:',
            {
              list: [
                'Estabelecido: sustentado por estudos conferidos na fonte primária.',
                'Provável: apoiado por estudos ou por descrição de livro-texto, ainda com lacunas.',
                'Especulativo: raciocínio mecânico ou escolha de projeto, sem teste direto.',
              ],
            },
            'Exercício marcado como hipótese é uma escolha SBL que ainda não foi testada em estudo próprio; o motivo mecânico aparece ao lado. Referência que ainda não foi conferida no original aparece como "[a verificar]". Nenhuma referência é inventada: o que não foi achado fica marcado, não preenchido.',
          ],
        },
        {
          title: 'De onde vem a anatomia',
          blocks: [
            'O corpo é a malha do Z-Anatomy (Gauthier Kervyn e colaboradores, CC BY-SA 4.0), derivada do BodyParts3D (The Database Center for Life Science, CC BY 4.0). O projeto fechou a pele, mediu os centros articulares, calculou os pesos de deformação e a linha central de cada músculo. Os caminhos musculares e os comprimentos saem dessa malha.',
          ],
        },
        {
          title: 'Quem mantém',
          blocks: [
            'O SBL View é mantido por Minessp. Não tem conta, servidor, anúncio nem coleta de dados. Correções de conteúdo e de referência são bem-vindas pelo repositório do projeto.',
          ],
        },
      ],
    },
    terms: {
      title: 'Termos de uso',
      lead: 'Regras para usar o SBL View. Ao usar o site, você concorda com elas.',
      sections: [
        {
          title: 'Uso por sua conta e risco',
          blocks: [
            'O conteúdo é educativo. Treinar envolve risco de lesão; a escolha de exercício, carga e volume é sua. O site não conhece o seu histórico, o seu corpo nem a sua técnica.',
          ],
        },
        {
          title: 'Sem orientação de saúde',
          blocks: [
            'Nada aqui é orientação médica, de fisioterapia, de nutrição ou prescrição individual de treino. Em caso de dor, lesão, gravidez ou qualquer condição de saúde, procure um profissional habilitado antes de treinar ou de mudar o treino.',
          ],
        },
        {
          title: 'Sem garantia',
          blocks: [
            'O site é oferecido como está, sem garantia de exatidão, de disponibilidade ou de adequação a um fim específico. O modelo anatômico é uma estimativa; estudos podem ser revistos; dados guardados no aparelho podem se perder se o navegador apagar o armazenamento. Faça backup em Treino → Dados.',
          ],
        },
        {
          title: 'Licença',
          blocks: [
            'O código é aberto para uso não comercial (PolyForm Noncommercial 1.0.0). Textos e dados próprios seguem a CC BY-NC-SA 4.0 e os arquivos derivados do Z-Anatomy, a CC BY-SA 4.0. Uso comercial do código ou do conteúdo próprio exige autorização do titular. Detalhes em Licenças e atribuições.',
          ],
        },
        {
          title: 'Serviços de terceiros',
          blocks: [
            'Se o site oferecer recursos que dependem de um serviço externo escolhido por você, como gerar um plano com um provedor de IA usando a sua própria chave, o pedido sai do seu aparelho direto para esse provedor, sob os termos, a política de privacidade e o custo dele. O SBL View não intermedeia, não guarda e não paga esses pedidos.',
          ],
        },
        {
          title: 'Mudanças',
          blocks: ['Estes termos podem mudar. A data no fim da página indica a versão em vigor; continuar usando o site depois de uma mudança vale como aceite.'],
        },
      ],
    },
    privacy: {
      title: 'Privacidade',
      lead: 'O SBL View não tem conta, cookie de rastreio nem analytics. O que você registra fica no seu aparelho.',
      sections: [
        {
          title: 'O que fica no aparelho',
          blocks: [
            'O site guarda no navegador só o que precisa para funcionar. Nada disso é enviado a servidor algum:',
            { table: { head: ['Onde', 'O quê', 'Por quanto tempo'], rows: STORAGE_ROWS } },
          ],
        },
        {
          title: 'Como apagar',
          blocks: [
            'Treino → Dados apaga os registros do Treino. Para apagar tudo, inclusive tema, qualidade e cache, limpe os dados do site nas configurações do navegador.',
            'O backup é um arquivo JSON que você baixa e guarda onde quiser. Ele só volta ao site se você mesmo importar.',
          ],
        },
        {
          title: 'O que sai do aparelho',
          blocks: [
            'Ao abrir o site, o navegador pede os arquivos dele à hospedagem, como em qualquer site. O serviço de hospedagem pode registrar dados técnicos desse pedido (endereço IP, navegador, página, horário), sob a política dele. O SBL View não acrescenta rastreio, pixel, anúncio nem análise de uso a esse pedido.',
            'Fontes, bibliotecas e o modelo 3D vêm do mesmo endereço do site: nenhuma chamada a terceiros acontece ao navegar.',
          ],
        },
        {
          title: 'Recursos com serviço externo',
          blocks: [
            'Quando existir um recurso que use um provedor escolhido por você (por exemplo, plano por IA com a sua chave), esta página vai listar o que é enviado, para quem e quando. Ele só age quando você pede.',
          ],
        },
      ],
    },
    licenses: {
      title: 'Licenças e atribuições',
      lead: 'Três licenças cobrem partes diferentes do SBL View. Titular: Minessp, 2026.',
      sections: [
        {
          title: 'Em linguagem simples',
          blocks: [
            {
              table: {
                head: ['Parte', 'Licença', 'Uso comercial'],
                rows: [
                  ['Código (componentes, motor, cena 3D, estilos, scripts)', 'PolyForm Noncommercial 1.0.0', 'Proibido sem autorização'],
                  ['Dados e textos próprios (músculos, movimentos, exercícios, clipes, textos de interface)', 'CC BY-NC-SA 4.0', 'Proibido sem autorização'],
                  ['Derivados do Z-Anatomy (malhas, imagens do corpo, linhas centrais dos músculos)', 'CC BY-SA 4.0', 'Permitido pela licença de origem'],
                ],
              },
            },
            {
              list: [
                'Pode, sem custo e sem pedir: usar, estudar, modificar e redistribuir para fins não comerciais (uso pessoal, estudo, pesquisa, ensino, instituições de caridade, de ensino, de pesquisa e órgãos públicos).',
                'Não pode sem autorização por escrito: vender cópias, cobrar acesso, exibir anúncios ou incluir o código ou o conteúdo próprio em produto ou serviço pago.',
                'Toda cópia leva o aviso "Required Notice: Copyright (c) 2026 Minessp" e o endereço da licença.',
                'Os derivados do Z-Anatomy seguem a CC BY-SA 4.0 de origem, cuja cláusula Compartilha Igual não admite restrição a mais.',
              ],
            },
            'Como atribuir: SBL View, por Minessp. Código sob PolyForm Noncommercial 1.0.0; conteúdo sob CC BY-NC-SA 4.0; modelo anatômico derivado do Z-Anatomy, CC BY-SA 4.0.',
            'Números citados de artigos científicos são fatos acompanhados da referência; a licença cobre a seleção, a organização e o texto, não os fatos.',
          ],
        },
        {
          title: 'Modelo anatômico',
          blocks: [
            'Z-Anatomy, "The libre 3D atlas of anatomy", Gauthier Kervyn e colaboradores, CC BY-SA 4.0. Derivado do BodyParts3D 4.0, © The Database Center for Life Science, CC BY 4.0.',
            'Modificações: só o lado direito e a linha média são guardados (o esquerdo é espelhado no navegador); pele fechada, com as regiões urogenital e anal removidas; coordenadas convertidas e escaladas para 1,75 m; quatro níveis de detalhe; pesos de deformação, linha central e vetor radial dos músculos calculados pelo projeto; posições quantizadas e comprimidas. Peças do repositório de origem com licença própria (ouvido interno, rim, nervos cranianos, cérebro) não são usadas.',
          ],
        },
        {
          title: 'Fonte tipográfica',
          blocks: ['Archivo (variável), Omnibus-Type, SIL Open Font License 1.1. Empacotada no site.'],
        },
        {
          title: 'Bibliotecas',
          blocks: [
            {
              table: {
                head: ['Biblioteca', 'Licença'],
                rows: [
                  ['React, react-dom', 'MIT'],
                  ['three.js', 'MIT'],
                  ['@react-three/fiber, @react-three/drei', 'MIT'],
                  ['meshoptimizer (decodificador)', 'MIT'],
                  ['Zustand', 'MIT'],
                  ['Dexie', 'Apache-2.0'],
                  ['Lenis', 'MIT'],
                  ['Motion', 'MIT'],
                  ['Zod', 'MIT'],
                  ['d3-scale, d3-shape', 'ISC'],
                  ['Lucide (ícones)', 'ISC'],
                  ['wouter', 'Unlicense'],
                  ['GSAP com ScrollTrigger', 'Standard "No Charge" License (GreenSock/Webflow)'],
                ],
              },
            },
            'GSAP não tem licença aberta; os termos do fabricante permitem uso gratuito. É usado só no capítulo "Ao vivo" da página inicial.',
          ],
        },
        {
          title: 'Referências científicas',
          blocks: [
            'Cada número traz a referência ao lado. Massas e centros de massa dos segmentos: de Leva (1996). Origem, inserção e ação dos músculos: descrição de livro-texto, com o OpenStax Anatomy and Physiology 2e (CC BY 4.0) como fonte citada, em texto reescrito.',
          ],
        },
      ],
    },
  },
};
