# Lyra

Site para explorar o histórico completo de escuta do Spotify: horas, artistas, músicas, podcasts e como tudo isso mudou ao longo dos anos.

Os arquivos do export são lidos **no próprio navegador**. O histórico não é enviado para servidor nenhum, e nenhum dado pessoal fica neste repositório. Para mostrar fotos de artistas e capas de álbuns, o site procura só os nomes que aparecem na tela no [Wikidata](https://www.wikidata.org/), no [Deezer](https://www.deezer.com/) e no [MusicBrainz](https://musicbrainz.org/), e guarda o resultado no navegador.

## Como usar

1. Peça seus dados em [spotify.com → Conta → Privacidade](https://www.spotify.com/account/privacy/), marcando **Histórico de streaming estendido**.
2. Quando o e-mail chegar, baixe o `my_spotify_data.zip`.
3. Abra o site e solte o zip (ou os arquivos `.json`) na página inicial.

Funciona com o histórico estendido (`Streaming_History_Audio_*.json`) e com o básico (`StreamingHistory_music_*.json`, `StreamingHistory_podcast_*.json`).

## Páginas

| Página | Status |
| --- | --- |
| Resumo: horas, top artistas e músicas, horas por mês | pronta |
| Curiosidades: calendário, relógio de escuta, plataformas, aleatório e músicas puladas | pronta |
| Linha do tempo: top 5 de cada ano, descobertas, fases e busca | pronta |
| Artista: horas por mês, posição em cada ano, músicas mais ouvidas | pronta |
| Explorar: músicas novas, lado B, roleta e shows perto de você | pronta |
| Wrapped: stories para o Instagram (Top 5 do último mês, do último ano e desde sempre, e a retrospectiva de cada ano), para baixar ou compartilhar | pronta |

## Shows perto de você: chave do Ticketmaster

A seção "Shows perto de você" (aba Explorar) usa a API de eventos do Ticketmaster. Ela usa uma chave grátis, que já está em [`src/config.ts`](src/config.ts); sem chave, a seção fica escondida. Para criar uma chave nova:

1. Abra o cadastro em [developer-account.ticketmaster.com/user/register](https://developer-account.ticketmaster.com/user/register). É a **Discovery API**, aberta a qualquer pessoa; a Partner API, de venda de ingressos, não é usada.
2. Preencha nome, empresa (pode ser `Lyra`), site da empresa (o endereço da Lyra no GitHub Pages), usuário e e-mail. Aceite os termos, marque o captcha e clique em **CREATE NEW ACCOUNT**.
3. Abra o e-mail do Ticketmaster, clique no link de acesso, crie uma senha e clique em **Save**.
4. Clique no seu nome de usuário (canto superior direito) → **My Apps** → clique no app `<usuário>-App`, que já vem criado. Na aba **Credentials**, copie o **Consumer Key**. O Consumer Secret não é usado.
5. Cole o código entre as aspas em [`src/config.ts`](src/config.ts): `export const TICKETMASTER_KEY = 'cole-aqui'`.

O limite grátis é de 5.000 buscas por dia; cada busca de shows da Lyra gasta umas 20 e fica guardada no aparelho por 6 horas. A chave fica visível no site (é feita para isso) e só permite ler eventos.

O Ticketmaster não diz quem toca em cada dia dos festivais. Esses line-ups ficam em [`src/data/lineups.ts`](src/data/lineups.ts), com a fonte de cada um: quando sair um anúncio novo, é só editar lá. Também ficam lá a arte certa de cada edição e os festivais que o Ticketmaster não vende (como o Primavera Sound, que é da Ingresse).

## Desenvolvimento

```bash
npm install
npm run dev      # abre em http://localhost:5173
npm run build    # gera o site em dist/
npm run lint
```

Feito com React, TypeScript, Vite e Apache ECharts. A cada push na `main`, o GitHub Actions publica o site no GitHub Pages.
