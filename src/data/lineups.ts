/*
 * Line-ups por dia dos festivais grandes. O Ticketmaster vende cada dia, mas não diz quem toca:
 * isto vem dos anúncios oficiais (fonte em cada um). Ao sair dia novo ou nome novo, é só editar aqui.
 */

export interface Lineup {
  /** Começo do nome do festival no Ticketmaster ("Lollapalooza Brasil 2027" começa com "Lollapalooza Brasil"). */
  match: string
  /** Nome a mostrar, quando o do Ticketmaster não serve ("The Town Club 2027" é a pré-venda, não o festival). */
  title?: string
  /** Cada dia do festival e quem toca, na ordem do cartaz. Dia vazio: ainda não anunciado. */
  days: Record<string, string[]>
  /** Projetos que a pessoa pode não reconhecer pelo nome → os artistas que ela talvez já ouça. */
  also?: Record<string, string[]>
  /** A arte da edição, quando a do Ticketmaster falta, é genérica ou é de outra coisa. */
  art?: string
  /** Festival que o Ticketmaster não vende: onde é e onde comprar, para aparecer mesmo assim. */
  where?: { venue: string; lat: number; lon: number }
  url?: string
}

export const LINEUPS: Lineup[] = [
  {
    // itatiaia.com.br/cultura-e-lazer/primavera-sound-sp-anuncia-line-up-por-dia-veja-quem-toca-em-cada-data (21/07/2026)
    // Vendido pela Ingresse, não pelo Ticketmaster. A arte é a do evento na Ingresse.
    match: 'Primavera Sound São Paulo',
    days: {
      '2026-12-05': [
        'The Strokes', 'FKA twigs', 'Lily Allen', 'CMAT', 'Courtney Barnett', 'Danny L Harle', 'Nation of Language',
        'Cara Delevingne', 'Zé Ibarra', 'John Talabot', 'Los Thuthanaka', 'Mannequin Pussy', 'Model/Actriz',
        'Nick León', 'Black Pantera', 'Gab Ferreira', 'Johnny Hooker', 'Josyara', 'LARINHX', 'Metrika',
      ],
      '2026-12-06': [
        'Gorillaz', 'Arca', 'Yung Lean', 'underscores', 'Duquesa', 'Smerz', 'ATARASHII GAKKO!', 'Ecco2k',
        'Gaby Amarantos', 'Ebony', 'Ana Frango Elétrico', 'Machine Girl', 'Sophia Stel', 'This Is Lorelei',
        'Carlos do Complexo', 'DJ Ramon Sucesso', 'Juana Molina', 'Julia Mestre', 'Melly', 'Paulete Lindacelva',
      ],
    },
    art: 'https://kraken.ingresse.com/event/posters/93986/medium/1785522828.6346488.jpg',
    where: { venue: 'Autódromo de Interlagos', lat: -23.7036, lon: -46.6997 },
    url: 'https://www.ingresse.com/primavera-sound-sp-2026/',
  },
  {
    // cnnbrasil.com.br/pop/musica/lollapalooza-2027-confira-o-line-up-completo-por-dia (14/10/2026)
    match: 'Lollapalooza Brasil',
    days: {
      '2027-03-19': [
        'Travis Scott', 'David Guetta', 'sombr', 'Cage the Elephant', 'Lola Young', 'Slayyyter', 'TOMORA',
        'Leon Bridges', 'Angine de Poitrine', 'Snow Strippers', 'Ninajirachi', 'Die Spitz', 'Cat Dealers',
        'Nação Zumbi', 'Fezzo', 'Majis', 'Rawayana', 'Carola & Curol', 'Make U Sweat', 'Marina Diniz',
        'Mary Olivetti', 'El Efecto', 'Rakta', 'Deafkids',
      ],
      '2027-03-20': [
        'The Killers', 'Queens of the Stone Age', 'Mochakk', 'Dominic Fike', 'Geese', 'Four Tet',
        'Rodrigo Amarante', 'Mike D 5D', 'Sammy Virji', 'Julia Wolf', 'Midnight Generation', 'Carlita',
        'Brime!!', 'Budang', 'Santos Bravos', 'Weird Baile', 'Grag Queen', 'Luana Flores', 'Buhr', 'Bebé',
        'Zepelim e o Sopro do Cão', 'DJ Ramemes', 'Paira', 'Joaquim', 'DJ Tamy',
      ],
      '2027-03-21': [
        'Charli xcx', 'The Neighbourhood', 'Fontaines D.C.', 'The Prodigy', 'Malcolm Todd', 'RAYE', 'ADÉLA',
        'Marlon Hoffstadt', 'Boys Noize', 'Criolo, Amaro & Dino', 'The Avalanches', 'Violet Grohl',
        'Boy Harsher', 'Mind Enterprises', 'Clementaum', 'Fernanda Martins', 'Acid Asian', 'Catïça',
        'Real No Ficción', 'Núbia', 'Seu Pereira e Coletivo 401', 'Psilosamples', 'Kenya20Hz', 'Ciça Moreira',
        'Clarissa',
      ],
    },
    also: {
      TOMORA: ['AURORA', 'The Chemical Brothers'],
      'Mike D 5D': ['Beastie Boys'],
      'Criolo, Amaro & Dino': ['Criolo', 'Amaro Freitas', "Dino D'Santiago"],
    },
  },
  {
    // istoe.com.br/the-town-2027-slipknot-marilyn-manson-atracoes (28/09/2026)
    match: 'The Town',
    title: 'The Town 2027',
    days: {
      '2027-09-04': ['Slipknot', 'Marilyn Manson'],
      '2027-09-05': [],
      '2027-09-06': [],
      '2027-09-11': [],
      '2027-09-12': [],
    },
  },
]
