/**
 * Gömülü (embed) video: YouTube, Vimeo, Dailymotion, Twitch (klip / video), Streamable, TikTok.
 *
 * Kayıt biçimi (Falcon `EmbedRef`, launcher `VideoEmbedRef` ile aynı):
 *   { provider, videoId, url, title?, author?, thumbnailUrl?, durationSeconds? }
 * `parseEmbedUrl` launcher `services/media/videoEmbed.ts` ve Falcon `EmbedRef` desenleriyle aynı kalır.
 *
 * Bitiş: YouTube, Vimeo, Dailymotion, Streamable (player.js) ve TikTok oynatıcı olayından; Twitch'te olay yok →
 * `durationSeconds` ya da `endSeconds` ya da `maxMs`. Her durumda `maxMs` (varsayılan 60 sn) üst sınırdır.
 */
import { sleep } from './util.js'

export const EMBED_PROVIDERS = ['youtube', 'vimeo', 'dailymotion', 'twitch', 'streamable', 'tiktok']

/** Sağlayıcı başına kimlik deseni (Falcon doğrulaması da bunu kullanır). */
export const EMBED_ID = {
    youtube: /^[A-Za-z0-9_-]{11}$/,
    vimeo: /^\d{1,12}(\/[0-9a-f]{6,20})?$/,
    dailymotion: /^x[0-9a-zA-Z]{4,12}$/,
    twitch: /^(\d{6,12}|[A-Za-z0-9_-]{4,100})$/,
    streamable: /^[0-9a-z]{4,12}$/,
    tiktok: /^\d{15,21}$/
}

function toUrl(input) {
    const raw = String(input ?? '').trim()
    if (!raw) return null
    try {
        return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    } catch {
        return null
    }
}

/** `1h2m3s`, `90s`, `90` → saniye. */
function seconds(value) {
    if (!value) return null
    if (/^\d+$/.test(value)) return Number(value)
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
    if (!m || !m[0]) return null
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** Bağlantı → `{ provider, videoId, start }`; tanınmazsa null. */
export function parseEmbedUrl(input) {
    const url = toUrl(input)
    if (!url) return null
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '')
    const parts = url.pathname.split('/').filter(Boolean)
    const start = seconds(url.searchParams.get('t') ?? url.searchParams.get('start'))
    let provider = null
    let id = null
    if (host === 'youtu.be') [provider, id] = ['youtube', parts[0]]
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        provider = 'youtube'
        id = parts[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live', 'v'].includes(parts[0]) ? parts[1] : null
    } else if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        provider = 'vimeo'
        const i = parts.findIndex((p) => /^\d+$/.test(p))
        if (i >= 0) {
            const hash = url.searchParams.get('h') ?? (/^[0-9a-f]{6,20}$/.test(parts[i + 1] ?? '') ? parts[i + 1] : null)
            id = hash ? `${parts[i]}/${hash}` : parts[i]
        }
    } else if (host === 'dailymotion.com' || host === 'dai.ly' || host === 'geo.dailymotion.com') {
        provider = 'dailymotion'
        id = host === 'dai.ly' ? parts[0] : parts[0] === 'video' ? parts[1] : url.searchParams.get('video')
        id = id?.split('_')[0] ?? null
    } else if (host === 'clips.twitch.tv') [provider, id] = ['twitch', parts[0] === 'embed' ? url.searchParams.get('clip') : parts[0]]
    else if (host === 'twitch.tv' || host === 'player.twitch.tv') {
        provider = 'twitch'
        if (parts[0] === 'videos') id = parts[1]
        else if (parts[1] === 'clip') id = parts[2]
        else if (url.searchParams.get('video')) id = url.searchParams.get('video').replace(/^v/, '')
    } else if (host === 'streamable.com') [provider, id] = ['streamable', parts[0] === 'e' || parts[0] === 'o' ? parts[1] : parts[0]]
    else if (host === 'tiktok.com') {
        provider = 'tiktok'
        const i = parts.indexOf('video')
        id = i >= 0 ? parts[i + 1] : parts[0] === 'player' ? parts[2] : null
    }
    if (!provider || !id || !EMBED_ID[provider].test(id)) return null
    return { provider, videoId: id, start }
}

/** Oynatıcı adresi. `parent`: Twitch'in istediği gömen alan adı. */
export function embedSrc(ref, { start = null, end = null, autoplay = true, controls = false, parent = location.hostname } = {}) {
    const id = ref.videoId
    const s = start ? Math.floor(start) : 0
    const auto = autoplay ? 1 : 0
    switch (ref.provider) {
        case 'youtube': {
            const q = new URLSearchParams({ autoplay: auto, controls: controls ? 1 : 0, rel: 0, playsinline: 1, enablejsapi: 1, origin: location.origin })
            if (s) q.set('start', s)
            if (end) q.set('end', Math.floor(end))
            return `https://www.youtube-nocookie.com/embed/${id}?${q}`
        }
        case 'vimeo': {
            const [vid, hash] = id.split('/')
            const q = new URLSearchParams({ autoplay: auto, controls: controls ? 1 : 0, title: 0, byline: 0, portrait: 0, dnt: 1 })
            if (hash) q.set('h', hash)
            return `https://player.vimeo.com/video/${vid}?${q}${s ? `#t=${s}s` : ''}`
        }
        case 'dailymotion':
            return `https://www.dailymotion.com/embed/video/${id}?autoplay=${auto}&controls=${controls ? 1 : 0}&api=postMessage&ui-logo=0&sharing-enable=0${s ? `&start=${s}` : ''}`
        case 'twitch':
            return /^\d+$/.test(id)
                ? `https://player.twitch.tv/?video=v${id}&parent=${parent}&autoplay=${autoplay}&muted=false${s ? `&time=${s}s` : ''}`
                : `https://clips.twitch.tv/embed?clip=${id}&parent=${parent}&autoplay=${autoplay}&muted=false`
        case 'streamable':
            return `https://streamable.com/e/${id}?autoplay=${auto}&nocontrols=${controls ? 0 : 1}${s ? `&t=${s}` : ''}`
        case 'tiktok':
            return `https://www.tiktok.com/player/v1/${id}?autoplay=${auto}&controls=${controls ? 1 : 0}&music_info=0&description=0&rel=0&loop=0&native_context_menu=0&closed_caption=0`
        default:
            return null
    }
}

function parseMessage(data) {
    if (typeof data !== 'string') return data
    try {
        return JSON.parse(data)
    } catch {
        return Object.fromEntries(new URLSearchParams(data)) // Dailymotion: "event=ended&id=…"
    }
}

/** Oynatıcı olay köprüsü: dinlemeyi başlatır, ses seviyesini ayarlar, bitişi `onEnd` ile bildirir. */
function bridge(frame, provider, volume, onEnd) {
    const origin = { youtube: 'https://www.youtube-nocookie.com', vimeo: 'https://player.vimeo.com', dailymotion: 'https://www.dailymotion.com', streamable: 'https://streamable.com', tiktok: 'https://www.tiktok.com' }[provider]
    if (!origin) return () => {}
    const post = (message) => frame.contentWindow?.postMessage(typeof message === 'string' ? message : JSON.stringify(message), provider === 'tiktok' ? '*' : origin)
    const handshake = () => {
        if (provider === 'youtube') {
            post({ event: 'listening', id: 1, channel: 'widget' })
            post({ event: 'command', func: 'setVolume', args: [volume] })
            post({ event: 'command', func: 'unMute', args: [] })
        } else if (provider === 'vimeo') {
            post({ method: 'addEventListener', value: 'ended' })
            post({ method: 'setVolume', value: volume / 100 })
        } else if (provider === 'streamable') {
            post({ context: 'player.js', version: '0.0.11', method: 'addEventListener', value: 'ended' })
            post({ context: 'player.js', version: '0.0.11', method: 'setVolume', value: volume })
        } else if (provider === 'tiktok') {
            frame.contentWindow?.postMessage({ type: 'unMute', 'x-tiktok-player': true }, '*')
            frame.contentWindow?.postMessage({ type: 'play', 'x-tiktok-player': true }, '*')
        }
    }
    const listener = (message) => {
        if (message.source !== frame.contentWindow) return
        const d = parseMessage(message.data) ?? {}
        const ended =
            (provider === 'youtube' && (d.info?.playerState === 0 || (d.event === 'onStateChange' && d.info === 0))) ||
            (provider === 'vimeo' && d.event === 'ended') ||
            (provider === 'dailymotion' && d.event === 'ended') ||
            (provider === 'streamable' && d.event === 'ended') ||
            (provider === 'tiktok' && d.type === 'onStateChange' && d.value === 0)
        if (ended) return onEnd()
        if ((provider === 'vimeo' && d.event === 'ready') || (provider === 'streamable' && d.event === 'ready') || (provider === 'tiktok' && d.type === 'onPlayerReady')) handshake()
    }
    window.addEventListener('message', listener)
    frame.addEventListener('load', () => {
        handshake()
        setTimeout(handshake, 800) // oynatıcı API'si yüklemeden biraz sonra hazır olur
    })
    return () => window.removeEventListener('message', listener)
}

/**
 * Gömülü videoyu `container` içinde oynatır, bitince kaldırır. Hata yayılmaz.
 * @param {object} ref  `{ provider, videoId, durationSeconds? }`
 * @param {object} [opts] `{ volume (0–100), startSeconds, endSeconds, maxMs, className }`
 */
export async function playEmbed(container, ref, { volume = 100, startSeconds = null, endSeconds = null, maxMs = null, className = '' } = {}) {
    const src = ref?.provider && EMBED_ID[ref.provider]?.test(ref.videoId ?? '') ? embedSrc(ref, { start: startSeconds, end: endSeconds }) : null
    if (!src) return
    const frame = document.createElement('iframe')
    frame.className = `se-media se-embed se-embed--${ref.provider} ${className}`.trim()
    frame.allow = 'autoplay; encrypted-media; fullscreen'
    frame.setAttribute('frameborder', '0')
    frame.setAttribute('scrolling', 'no')
    let finish
    const done = new Promise((resolve) => (finish = resolve))
    const unbind = bridge(frame, ref.provider, Math.max(0, Math.min(100, volume)), () => finish())
    frame.src = src
    container.appendChild(frame)
    const start = startSeconds ?? 0
    const known = endSeconds ? endSeconds - start : ref.durationSeconds ? ref.durationSeconds - start : null
    const limit = Math.min(maxMs ?? 60_000, known ? known * 1000 + 1500 : Infinity)
    try {
        await Promise.race([done, sleep(limit)])
    } finally {
        unbind()
        frame.remove()
    }
}
