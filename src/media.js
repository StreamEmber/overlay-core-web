/** Medya oynatıcı, sıralı kuyruk ve sıralama listesi. */
import { sleep } from './util.js'

const VIDEO = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i
const AUDIO = /\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?|#|$)/i
const LOTTIE = /\.json(\?|#|$)/i
const LOTTIE_URL = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js'

/** `mediaType` (VIDEO/AUDIO/IMAGE/LOTTIE) ya da uzantıdan tür. */
export function mediaKind(url, type) {
    const t = String(type ?? '').toUpperCase()
    if (t === 'VIDEO' || t === 'AUDIO' || t === 'IMAGE' || t === 'LOTTIE') return t
    if (LOTTIE.test(url)) return 'LOTTIE'
    if (VIDEO.test(url)) return 'VIDEO'
    if (AUDIO.test(url)) return 'AUDIO'
    return 'IMAGE'
}

let lottieLoading = null
function loadLottie() {
    lottieLoading ??= new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = LOTTIE_URL
        s.onload = () => resolve(window.lottie)
        s.onerror = reject
        document.head.appendChild(s)
    })
    return lottieLoading
}

/**
 * Medyayı `container` içinde oynatır, bitince (ya da `maxMs` dolunca) kaldırır.
 * Resim/lottie için süre `durationMs` (varsayılan 5 sn). Hata yayılmaz: oynatılamayan medya atlanır.
 */
export async function playMedia(container, { url, type, volume = 100, durationMs = null, maxMs = null, startSeconds = null, endSeconds = null, className = '' }) {
    if (!url) return
    const kind = mediaKind(url, type)
    const range = endSeconds ? (endSeconds - (startSeconds ?? 0)) * 1000 : Infinity
    const limit = Math.min(maxMs ?? 60_000, range)
    let el
    let done
    try {
        if (kind === 'VIDEO' || kind === 'AUDIO') {
            el = document.createElement(kind === 'VIDEO' ? 'video' : 'audio')
            el.src = url
            el.volume = Math.max(0, Math.min(1, volume / 100))
            el.playsInline = true
            if (startSeconds) el.currentTime = startSeconds
            done = new Promise((resolve) => {
                el.onended = resolve
                el.onerror = resolve
            })
            if (kind === 'VIDEO') container.appendChild(el)
            await el.play().catch(() => {
                // OBS dışı tarayıcılar sesli otomatik oynatmayı engelleyebilir: sessiz dene.
                el.muted = true
                return el.play()
            })
        } else if (kind === 'LOTTIE') {
            const lottie = await loadLottie()
            el = document.createElement('div')
            container.appendChild(el)
            const anim = lottie.loadAnimation({ container: el, renderer: 'svg', loop: false, autoplay: true, path: url })
            done = new Promise((resolve) => {
                anim.addEventListener('complete', resolve)
                anim.addEventListener('data_failed', resolve)
            })
            if (durationMs) done = sleep(durationMs)
        } else {
            el = document.createElement('img')
            el.src = url
            container.appendChild(el)
            done = sleep(durationMs ?? 5000)
        }
        if (el) el.className = `se-media ${className}`.trim()
        await Promise.race([done, sleep(limit)])
    } catch (error) {
        console.warn('[overlay] medya oynatılamadı', url, error)
    } finally {
        el?.pause?.()
        el?.remove()
    }
}

/** Sıralı iş kuyruğu: işler tek tek çalışır; `max` dolunca yenileri atılır. */
export function createQueue({ max = 10 } = {}) {
    const items = []
    let running = false
    let generation = 0
    async function pump() {
        if (running) return
        running = true
        const gen = generation
        while (items.length && gen === generation) {
            const task = items.shift()
            try {
                await task()
            } catch (error) {
                console.warn('[overlay] kuyruk işi başarısız', error)
            }
        }
        // reset sonrası eski döngü yeni döngünün bayrağına dokunmaz
        if (gen === generation) running = false
    }
    return {
        push(task) {
            if (items.length >= max) return false
            items.push(task)
            pump()
            return true
        },
        clear() {
            items.length = 0
            generation++
            running = false
        },
        get size() {
            return items.length
        },
        setMax(value) {
            max = value
        }
    }
}

/** İzleyici sıralaması (en çok beğeni / hediye …). `add` toplamı artırır; `top(n)` azalan sırada döner. */
export function createLeaderboard() {
    const rows = new Map()
    return {
        add(user, amount = 1) {
            const id = String(user?.id ?? user?.username ?? '')
            if (!id || !amount) return null
            const row = rows.get(id) ?? { id, total: 0 }
            row.total += amount
            row.username = user.username ?? row.username
            row.nickname = user.nickname ?? user.username ?? row.nickname
            row.avatarUrl = user.avatarUrl ?? row.avatarUrl
            row.updatedAt = Date.now()
            rows.set(id, row)
            return row
        },
        top(n = 10) {
            return [...rows.values()].sort((a, b) => b.total - a.total || a.updatedAt - b.updatedAt).slice(0, n)
        },
        reset() {
            rows.clear()
        },
        get size() {
            return rows.size
        }
    }
}
