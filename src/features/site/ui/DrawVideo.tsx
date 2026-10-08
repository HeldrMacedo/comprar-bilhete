import { Play } from 'lucide-react'
import { useState } from 'react'
import { useSiteSettings } from '../runtime/use-site-settings'

// Miniatura primeiro: o player do YouTube (e seus cookies) só carrega depois do clique.
export function DrawVideo() {
  const settings = useSiteSettings()
  const [playing, setPlaying] = useState(false)
  const videoId = settings.data?.youtubeVideoId
  if (!videoId) return null

  return (
    <section className="container draw-video" aria-labelledby="draw-video-title">
      <h2 id="draw-video-title">Assista ao sorteio</h2>
      <div className="draw-video__frame">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            title="Vídeo do sorteio no YouTube"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            className="draw-video__poster"
            onClick={() => setPlaying(true)}
            aria-label="Reproduzir vídeo do sorteio"
          >
            <img
              src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              width={480}
              height={360}
            />
            <span className="draw-video__play" aria-hidden="true">
              <Play size={30} fill="currentColor" />
            </span>
          </button>
        )}
      </div>
    </section>
  )
}
