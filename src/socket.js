/**
 * EventFabric canlı akışı (`/events/ws?customerUuid=`), launcher `EventFabricStream` ile aynı protokol:
 * JSON frame, koparsa son cursor ile `replay=true`, replay sayfaları `replay.next` ile istenir.
 * Aynı olay kimliği iki kez verilmez.
 *
 * `url`: EventFabric kök adresi ya da onu döndüren fonksiyon. Adres her (yeniden) bağlanmada okunur; değişmişse
 * (yayıncı başka EventFabric makinesine geçti) cursor bırakılır — eski makinenin cursor'ı yenisinde geçersizdir.
 *
 * Yeniden bağlanma 1, 2, 4, 8, 15, 30 sn, ±%30 rastgele sapmalı. Tarayıcı el sıkışma reddinin (409 `wrong_node`,
 * 503 `node_disabled`) gövdesini göremez; soket üst üste 3 kez hiç açılamazsa `onError({ code: 'connect_failed' })`
 * çağrılır ki adres yeniden çözülsün.
 */
const BACKOFF_SECONDS = [1, 2, 4, 8, 15, 30]
const FAILURES_BEFORE_RESOLVE = 3
/** EventFabric kopmada 5 dk'ya kadar geri oynatır; bundan eski geri oynatılan olay `stale` işaretlenir (uyarı gösterilmez). */
const STALE_REPLAY_MS = 60_000
const MAX_SEEN = 4000

export function connectEvents({ url, customerUuid, onEvent, onStatus = () => {}, onError = () => {} }) {
    let socket = null
    let cursor = null
    let attempt = 0
    let timer = null
    let stopped = false
    let lastUrl = null
    let failures = 0
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
        let opened = false
        current.onopen = () => {
            opened = true
            attempt = 0
            failures = 0
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
                        const replayed = Boolean(frame.replayed)
                        const stale = replayed && Date.now() - Number(frame.event.occurredAtUnixMs || 0) > STALE_REPLAY_MS
                        onEvent(frame.event, { replayed, stale })
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
            else if (!opened && ++failures >= FAILURES_BEFORE_RESOLVE) {
                failures = 0
                onError({ type: 'error', code: 'connect_failed', message: 'EventFabric could not be reached' })
            }
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
        }, BACKOFF_SECONDS[Math.min(attempt - 1, BACKOFF_SECONDS.length - 1)] * 1000 * (0.7 + Math.random() * 0.6))
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
