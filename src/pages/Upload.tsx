import { useRef, useState } from 'react'
import { installGuide, useInstall } from '../ui/install'
import { InstallGuide } from '../ui/InstallGuide'
import { pick, t } from '../i18n'
import { hasConcerts } from '../data/concerts'

const tapToChoose = () => t('Toque para escolher o arquivo', 'Tap to choose the file', 'Toca para elegir el archivo')
const installApp = () => t('Instalar o app', 'Install the app', 'Instalar la app')
const privacy = 'https://www.spotify.com/account/privacy/'

interface Props {
  busy: string | null
  error: string | null
  notice: string | null
  onFiles: (files: File[]) => void
}

export function Upload({ busy, error, notice, onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const install = useInstall()

  const take = (list: FileList | null) => {
    if (list && list.length) onFiles([...list])
  }

  return (
    <main className="upload">
      <h1>
        {t('Seu Spotify,', 'Your Spotify,', 'Tu Spotify,')}
        <br />
        <span className="accent">{t('do começo até hoje.', 'from day one to today.', 'desde el principio hasta hoy.')}</span>
      </h1>
      <p className="lead">
        {t(
          'Envie aqui o arquivo que o Spotify te mandou e veja tudo o que você já ouviu: horas, artistas, manias e fases.',
          "Upload the file Spotify sent you and see everything you've ever listened to: hours, artists, habits and phases.",
          'Sube aquí el archivo que te mandó Spotify y mira todo lo que has escuchado: horas, artistas, manías y etapas.',
        )}
      </p>

      {notice && <p className="notice">{notice}</p>}
      <div
        className={`drop ${over ? 'over' : ''} ${busy ? 'busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (!busy) take(e.dataTransfer.files)
        }}
        onClick={() => !busy && input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && input.current?.click()}
      >
        {busy ? (
          <>
            <div className="spinner" aria-hidden />
            <strong>{busy}</strong>
          </>
        ) : (
          <>
            <strong className="on-desk">
              {t('Arraste o .zip ou os arquivos .json aqui', 'Drag the .zip or the .json files here', 'Arrastra aquí el .zip o los archivos .json')}
            </strong>
            <span className="on-desk">{t('ou clique para escolher', 'or click to choose', 'o haz clic para elegir')}</span>
            <strong className="on-touch">{tapToChoose()}</strong>
            <span className="on-touch">
              {t(
                'o my_spotify_data.zip, na pasta Downloads',
                'my_spotify_data.zip, in your Downloads folder',
                'el my_spotify_data.zip, en la carpeta Descargas',
              )}
            </span>
          </>
        )}
        <input
          ref={input}
          type="file"
          // Alguns Androids salvam o zip com outro tipo e o escondem da lista; por isso os tipos extras.
          accept=".zip,.json,application/zip,application/x-zip-compressed,application/x-zip,application/octet-stream,application/json"
          multiple
          hidden
          onChange={(e) => take(e.target.files)}
        />
      </div>
      {error && <p className="error">{error}</p>}

      {(install || installGuide) && (
        <div className="install">
          {install ? (
            <button className="primary" onClick={install}>
              {installApp()}
            </button>
          ) : (
            installGuide && <InstallGuide label={installApp()} kind={installGuide} />
          )}
          {!installGuide?.startsWith('ios') && (
            <span>
              {t(
                'Com o app instalado, é só tocar em Compartilhar no zip e escolher Lyra.',
                'With the app installed, just tap Share on the zip and choose Lyra.',
                'Con la app instalada, solo tienes que tocar Compartir en el zip y elegir Lyra.',
              )}
            </span>
          )}
        </div>
      )}

      <details className="howto">
        <summary>{t('Como conseguir meus dados do Spotify?', 'How do I get my Spotify data?', '¿Cómo consigo mis datos de Spotify?')}</summary>
        {pick(
          <ol>
            <li>
              Entre em <a href={privacy} target="_blank" rel="noreferrer">spotify.com → Conta → Privacidade</a>.
            </li>
            <li>
              Marque <strong>Histórico de streaming estendido</strong> (ele tem a conta inteira, não só o último ano) e
              peça os dados.
            </li>
            <li>Confirme pelo e-mail. O Spotify manda o link em alguns dias.</li>
            <li>Baixe o <code>my_spotify_data.zip</code> e solte aqui, sem precisar descompactar.</li>
            <li>
              Pediu também os <strong>Dados da conta</strong>? Solte os dois zips juntos para ver suas playlists, curtidas
              esquecidas e o seu selo de ouvinte em cada artista.
            </li>
          </ol>,
          <ol>
            <li>
              Go to <a href={privacy} target="_blank" rel="noreferrer">spotify.com → Account → Privacy</a>.
            </li>
            <li>
              Tick <strong>Extended streaming history</strong> (it covers your whole account, not just the last year) and
              request the data.
            </li>
            <li>Confirm by email. Spotify sends the link within a few days.</li>
            <li>Download <code>my_spotify_data.zip</code> and drop it here, no need to unzip it.</li>
            <li>
              Also requested your <strong>Account data</strong>? Drop both zips together to see your playlists, forgotten
              likes and your listener badge for each artist.
            </li>
          </ol>,
          <ol>
            <li>
              Entra en <a href={privacy} target="_blank" rel="noreferrer">spotify.com → Cuenta → Privacidad</a>.
            </li>
            <li>
              Marca <strong>Historial de reproducción ampliado</strong> (incluye toda la cuenta, no solo el último año) y
              solicita los datos.
            </li>
            <li>Confírmalo por correo. Spotify manda el enlace en unos días.</li>
            <li>Descarga el <code>my_spotify_data.zip</code> y suéltalo aquí, sin descomprimirlo.</li>
            <li>
              ¿Pediste también los <strong>Datos de la cuenta</strong>? Suelta los dos zips juntos para ver tus playlists,
              favoritas olvidadas y tu sello de oyente en cada artista.
            </li>
          </ol>,
        )}
      </details>

      <details className="howto">
        <summary>{t('Como enviar pelo celular?', 'How do I upload from my phone?', '¿Cómo lo subo desde el móvil?')}</summary>
        {pick(
          <ol>
            <li>
              No e-mail do Spotify, abra o link de download no navegador (Safari no iPhone, Chrome no Android). Se o e-mail
              estiver no app do Gmail ou do Outlook, use <strong>Abrir no navegador</strong>: dentro desses apps o arquivo
              costuma não ser salvo.
            </li>
            <li>
              Toque em baixar e entre na sua conta se o Spotify pedir. No iPhone o arquivo vai para o app{' '}
              <strong>Arquivos</strong>, em Downloads. No Android, vai para <strong>Downloads</strong>.
            </li>
            <li>
              Volte aqui, toque em <strong>Toque para escolher o arquivo</strong> e procure em Downloads. No iPhone, escolha{' '}
              <strong>Escolher arquivo</strong> ou <strong>Procurar</strong>.
            </li>
            <li>
              Se o celular abriu o zip e ele virou uma pasta, tudo bem: entre na pasta e marque os arquivos que começam com{' '}
              <code>Streaming_History_Audio</code>.
            </li>
            <li>
              No Android tem um atalho: instale o site como app (botão <strong>Instalar o app</strong> ou menu ⋮ do Chrome →{' '}
              <strong>Instalar app</strong>). Depois, em Downloads, segure o zip, toque em <strong>Compartilhar</strong> e
              escolha <strong>Lyra</strong>.
            </li>
          </ol>,
          <ol>
            <li>
              In Spotify&apos;s email, open the download link in your browser (Safari on iPhone, Chrome on Android). If the
              email is in the Gmail or Outlook app, use <strong>Open in browser</strong>: inside those apps the file often
              isn&apos;t saved.
            </li>
            <li>
              Tap download and sign in if Spotify asks. On iPhone the file goes to the <strong>Files</strong> app, in
              Downloads. On Android, it goes to <strong>Downloads</strong>.
            </li>
            <li>
              Come back here, tap <strong>{tapToChoose()}</strong> and look in Downloads. On iPhone, pick{' '}
              <strong>Choose File</strong> or <strong>Browse</strong>.
            </li>
            <li>
              If your phone opened the zip and it turned into a folder, that&apos;s fine: open the folder and select the files
              starting with <code>Streaming_History_Audio</code>.
            </li>
            <li>
              On Android there&apos;s a shortcut: install the site as an app (the <strong>{installApp()}</strong> button or
              Chrome&apos;s ⋮ menu → <strong>Install app</strong>). Then, in Downloads, hold the zip, tap{' '}
              <strong>Share</strong> and choose <strong>Lyra</strong>.
            </li>
          </ol>,
          <ol>
            <li>
              En el correo de Spotify, abre el enlace de descarga en el navegador (Safari en iPhone, Chrome en Android). Si el
              correo está en la app de Gmail o de Outlook, usa <strong>Abrir en el navegador</strong>: dentro de esas apps el
              archivo no suele guardarse.
            </li>
            <li>
              Toca descargar e inicia sesión si Spotify lo pide. En iPhone el archivo va a la app <strong>Archivos</strong>, en
              Descargas. En Android, va a <strong>Descargas</strong>.
            </li>
            <li>
              Vuelve aquí, toca <strong>{tapToChoose()}</strong> y busca en Descargas. En iPhone, elige{' '}
              <strong>Elegir archivo</strong> o <strong>Explorar</strong>.
            </li>
            <li>
              Si el móvil abrió el zip y se convirtió en una carpeta, no pasa nada: entra en la carpeta y marca los archivos
              que empiezan por <code>Streaming_History_Audio</code>.
            </li>
            <li>
              En Android hay un atajo: instala el sitio como app (botón <strong>{installApp()}</strong> o menú ⋮ de Chrome →{' '}
              <strong>Instalar aplicación</strong>). Después, en Descargas, mantén pulsado el zip, toca{' '}
              <strong>Compartir</strong> y elige <strong>Lyra</strong>.
            </li>
          </ol>,
        )}
      </details>
      <details className="howto">
        <summary>{t('Como o app funciona?', 'How does the app work?', '¿Cómo funciona la app?')}</summary>
        <ol>
          <li>
            {t(
              'O arquivo é lido aqui mesmo, no navegador: seu histórico não vai para nenhum servidor.',
              'The file is read right here in the browser: your history never goes to a server.',
              'El archivo se lee aquí mismo, en el navegador: tu historial no va a ningún servidor.',
            )}
          </li>
          <li>
            {t(
              'Ele fica guardado só neste aparelho, para você não precisar enviar de novo. Para apagar, use o botão de sair, no topo.',
              "It's kept only on this device, so you don't have to upload it again. To delete it, use the leave button at the top.",
              'Se guarda solo en este dispositivo, para que no tengas que subirlo de nuevo. Para borrarlo, usa el botón de salir, arriba.',
            )}
          </li>
          <li>
            {t(
              'Para fotos, capas, prévias e descobertas, o site busca só nomes de artistas e álbuns no Wikidata, no MusicBrainz e no Deezer.',
              'For photos, covers, previews and discoveries, the site only looks up artist and album names in Wikidata, MusicBrainz and Deezer.',
              'Para fotos, portadas, avances y descubrimientos, el sitio solo busca nombres de artistas y álbumes en Wikidata, MusicBrainz y Deezer.',
            )}
          </li>
          {hasConcerts() && (
            <li>
              {t(
                'Para achar shows, o Ticketmaster recebe só a sua região e os nomes dos artistas.',
                'To find gigs, Ticketmaster only gets your area and artist names.',
                'Para encontrar conciertos, Ticketmaster solo recibe tu zona y los nombres de los artistas.',
              )}
            </li>
          )}
        </ol>
      </details>
    </main>
  )
}
