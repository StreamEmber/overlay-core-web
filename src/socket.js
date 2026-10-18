/**
 * EventFabric canlı akışı (`/events/ws?customerUuid=`), launcher `EventFabricStream` ile aynı protokol:
 * JSON frame, koparsa son cursor ile `replay=true`, replay sayfaları `replay.next` ile istenir.
 * Aynı olay kimliği iki kez verilmez.
 *
 * `url`: EventFabric kök adresi ya da onu döndüren fonksiyon. Adres her (yeniden) bağlanmada okunur; değişmişse
 * (yayıncı bölge değiştirdi) cursor bırakılır — eski bölgenin cursor'ı yenisinde geçersizdir.
 */
const MAX_SEEN = 4000

export function connectEvents({ url, customerUuid, onEvent, onStatus = () => {}, onError = () => {} }) {
    let socket = null
    let cursor = null
    let attempt = 0
    let timer = null
    let stopped = false
    let lastUrl = null
    const seen = new Set()

    function open() {
        if (stopped) return
        const base = String((typeof url === 'function' ? url() : url) || '').replace(/\/+$/, '').replace(/^http/i, 'ws')
        if (!base) {
            onStatus('error')
            return
        }
        if (lastUrl && lastUrl !== base) cursor = null
        lastUrl = base
        const query = new URLSearchParams({ format: 'json', customerUuid })
        if (cursor) {
            query.set('replay', 'true')
            query.set('cursor', cursor)
        }
        onStatus(attempt ? 'reconnecting' : 'connecting')
        try {
            socket = new WebSocket(`${base}/events/ws?${query}`)
        } catch {
            return retry()
        }
        const current = socket
        current.onopen = () => {
            attempt = 0
            onStatus('open')
        }
        current.onmessage = (message) => {
            if (socket !== current || typeof message.data !== 'string') return
            let frame
            try {
                frame = JSON.parse(message.data)
            } catch {
                return
            }
            if (frame.system?.type === 'error') {
                // Sözleşme: { type: 'error', code, message, params }; kapanış nedeni de aynı kod.
                onError(frame.system)
                return
            }
            if (frame.system?.type === 'replay.completed' && frame.system.hasMore && frame.cursor) {
                current.send(JSON.stringify({ type: 'replay.next', requestId: `overlay-${Date.now()}`, cursor: frame.cursor, limit: 100 }))
            }
            if (frame.packetType === 'event' && frame.event) {
                const id = frame.event.id
                if (!id || !seen.has(id)) {
                    if (id) {
                        seen.add(id)
                        if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value)
                    }
                    try {
                        onEvent(frame.event, { replayed: Boolean(frame.replayed) })
                    } catch (error) {
                        console.error('[overlay] olay işlenemedi', error)
                    }
                }
            }
            if (frame.cursor) cursor = frame.cursor
        }
        current.onclose = (closeEvent) => {
            if (socket !== current) return
            socket = null
            if (closeEvent?.reason && /^[a-z_]+$/.test(closeEvent.reason) && closeEvent.reason !== 'reconnect') onError({ type: 'error', code: closeEvent.reason, message: closeEvent.reason })
            retry()
        }
    }

    function retry() {
        if (stopped || timer) return
        attempt++
        onStatus('reconnecting')
        timer = setTimeout(() => {
            timer = null
            open()
        }, Math.min(15_000, 1000 * 2 ** Math.min(4, attempt - 1)))
    }

    open()
    return {
        /** Soketi kapatıp yeniden açar (adres yeniden okunur). */
        reconnect() {
            if (stopped) return
            const current = socket
            socket = null
            current?.close(1000, 'reconnect')
            clearTimeout(timer)
            timer = null
            attempt = 0
            open()
        },
        close() {
            stopped = true
            clearTimeout(timer)
            socket?.close(1000, 'stopped')
            socket = null
        }
    }
}
