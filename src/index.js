/**
 * @streamemberplatform/overlay-core-web — bütün StreamEmber overlay'lerinin çekirdeği.
 *
 * Açılış modları:
 *   /0xKEY           live  — render.php `window.__SE_OVERLAY__` gömer (Falcon `/public/overlays/{key}` kaydı);
 *                           EventFabric'e kaydın `eventFabricUrl` adresinden (yayıncının bölgesi) bağlanılır
 *   /0xKEY#demo      demo  — kullanıcının varyant/ayarı (+ kuralları), soket yok, sahte olaylar
 *   /overlay-x-web/  demo  — boot verisi yok, varsayılanlarla
 *   ?key=0x…         boot verisi `/api/resolve/{key}`'den (geliştirme)
 *   #demo&variant=x  varyantı ezer
 *
 * Launcher iframe'i `postMessage({ type: 'streamember:overlay', action, payload })` ile yönetir:
 * reset · trigger · setVariant · setConfig · reload · pause · resume. Hazır olunca `ready` yollanır.
 */
import { connectEvents } from './socket.js'
import { randomDemoEvent } from './demo.js'
import { mergeConfig } from './util.js'

export { playMedia, createQueue, createLeaderboard, mediaKind } from './media.js'
export { demoEvent, demoUser, randomDemoEvent, avatar } from './demo.js'
export { template, fnv1a32, num, handle, mergeConfig } from './util.js'
export { createScreenOverlay } from './screen.js'
export { createWelcomeOverlay, matchesRule, findRule } from './welcome.js'

export const SDK_VERSION = '1.1.0'
const MESSAGE_TYPE = 'streamember:overlay'
const REFRESH_MS = 60_000

async function json(url) {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
        // Sözleşme hata gövdesi: { status, code, message }
        const body = await response.json().catch(() => null)
        const error = new Error(body?.message || `${url}: ${response.status}`)
        error.status = response.status
        error.code = body?.code || 'http_error'
        throw error
    }
    return response.json()
}

async function loadBoot() {
    if (window.__SE_OVERLAY__) return window.__SE_OVERLAY__
    const key = new URLSearchParams(location.search).get('key')
    if (!key || !/^0x[A-Za-z0-9]{10}$/.test(key)) return null
    try {
        return await json(`/api/resolve/${key}`)
    } catch (error) {
        console.warn('[overlay] anahtar çözülemedi, demo açılıyor', error)
        return null
    }
}

/**
 * Overlay'i başlatır.
 * @param {object} def
 * @param {string[]} [def.events]      dinlenecek kanonik türler (`like`, `gift` …); yoksa manifest `events`
 * @param {(ctx) => any} [def.init]
 * @param {(event, ctx, meta) => any} [def.onEvent]   meta: { demo?, replayed? }
 * @param {(ctx) => any} [def.onReset]
 * @param {(ctx) => any} [def.onConfig]       varyant / ayar / kurallar değişti
 * @param {(ctx) => object|null} [def.demo]   demo olayı üretir (null = bu tur atla)
 * @param {(payload, ctx) => boolean} [def.onTrigger]  launcher "Test"; true = işlendi
 * @param {(ctx) => any} [def.onRefresh]      canlıda periyodik tazeleme (ör. kurallar)
 * @param {number} [def.demoIntervalMs]
 */
export async function createOverlay(def = {}) {
    const html = document.documentElement
    const hash = new URLSearchParams(location.hash.slice(1))
    const boot = await loadBoot()
    const manifest = await json(new URL('manifest.json', document.baseURI)).catch(() => ({}))
    const live = Boolean(boot?.customerUuid) && !hash.has('demo')

    const ctx = {
        mode: live ? 'live' : 'demo',
        kind: boot?.kind ?? manifest.kind ?? 'WIDGET',
        key: boot?.key ?? null,
        slot: boot?.slot ?? 0,
        name: boot?.name ?? null,
        customerUuid: boot?.customerUuid ?? null,
        /** Yayıncının bölgesindeki EventFabric; 60 sn'lik tazelemede güncellenir (bölge değişimi). */
        eventFabricUrl: boot?.eventFabricUrl ?? null,
        user: boot?.user ?? null,
        locked: Boolean(boot?.locked),
        welcome: boot?.welcome ?? [],
        revision: boot?.revision ?? null,
        manifest,
        linkConfig: boot?.config ?? {},
        variant: null,
        config: {},
        paused: false,
        root: document.getElementById('overlay') ?? document.body,
        status: 'idle'
    }
    const kinds = def.events ?? manifest.events ?? []

    function applyVariant(requested) {
        const variants = manifest.variants ?? []
        const id = variants.some((v) => v.id === requested) ? requested : (variants[0]?.id ?? null)
        ctx.variant = id
        ctx.config = mergeConfig(manifest, id, ctx.linkConfig)
        html.dataset.variant = id ?? ''
        let link = document.querySelector('link[data-se-variant]')
        if (!id) return link?.remove()
        if (!link) {
            link = document.createElement('link')
            link.rel = 'stylesheet'
            link.dataset.seVariant = ''
            document.head.appendChild(link)
        }
        const href = new URL(`variants/${id}.css`, document.baseURI).href
        if (link.href !== href) link.href = href
    }

    function dispatch(event, meta = {}) {
        if (!event || (kinds.length && !kinds.includes(event.kind))) return
        def.onEvent?.(event, ctx, meta)
    }
    ctx.emit = dispatch

    applyVariant(hash.get('variant') || boot?.variant)
    html.dataset.mode = ctx.mode
    html.dataset.kind = ctx.kind

    // Kilitli overlay canlıda hiçbir şey göstermez (OBS'te şeffaf kalır).
    if (live && ctx.locked) {
        html.dataset.locked = 'true'
        return ctx
    }

    await def.init?.(ctx)

    const refresh = () => {
        def.onConfig?.(ctx)
    }

    // ── Launcher kontrolü ──
    window.addEventListener('message', (message) => {
        if (message.source !== window.parent || message.data?.type !== MESSAGE_TYPE) return
        const { action, payload = {} } = message.data
        switch (action) {
            case 'reset':
                def.onReset?.(ctx)
                break
            case 'trigger':
                if (payload.event) dispatch(payload.event, { demo: true })
                else if (!def.onTrigger?.(payload, ctx)) dispatch(def.demo ? def.demo(ctx) : randomDemoEvent(kinds), { demo: true })
                break
            case 'setVariant':
                applyVariant(payload.variant)
                refresh()
                break
            case 'setConfig':
                ctx.linkConfig = payload.config ?? {}
                applyVariant(ctx.variant)
                refresh()
                break
            case 'reload':
                location.reload()
                break
            case 'pause':
                ctx.paused = true
                html.dataset.paused = 'true'
                break
            case 'resume':
                ctx.paused = false
                delete html.dataset.paused
                break
        }
    })
    if (window.parent !== window) window.parent.postMessage({ type: MESSAGE_TYPE, action: 'ready', payload: { kind: ctx.kind, key: ctx.key } }, '*')

    if (live) {
        const events = connectEvents({
            url: () => ctx.eventFabricUrl,
            customerUuid: ctx.customerUuid,
            onEvent: (event, meta) => dispatch(event, meta),
            onStatus: (status) => {
                ctx.status = status
                html.dataset.status = status
            },
            onError: async (error) => {
                console.warn('[overlay] EventFabric', error.code, error.message)
                // Yayıncı bölge değiştirdi: kaydı yeniden çöz, yeni adrese bağlan.
                if (error.code !== 'wrong_region') return
                const next = await json(`/api/resolve/${ctx.key}`).catch(() => null)
                const target = next?.eventFabricUrl || error.params?.eventFabricUrl
                if (target && target !== ctx.eventFabricUrl) {
                    ctx.eventFabricUrl = target
                    events.reconnect()
                }
            }
        })
        // Launcher'dan kaydedilen değişiklikler OBS'teki kopyaya en geç bir dakikada yansır.
        setInterval(async () => {
            try {
                const next = await json(`/api/resolve/${ctx.key}`)
                if (next.eventFabricUrl && next.eventFabricUrl !== ctx.eventFabricUrl) {
                    ctx.eventFabricUrl = next.eventFabricUrl
                    events.reconnect()
                }
                if (next.revision !== ctx.revision) {
                    Object.assign(ctx, { revision: next.revision, linkConfig: next.config ?? {}, welcome: next.welcome ?? [], name: next.name, locked: next.locked })
                    if (next.locked) return location.reload()
                    applyVariant(next.variant)
                    refresh()
                }
                await def.onRefresh?.(ctx)
            } catch (error) {
                console.warn('[overlay] tazeleme başarısız', error)
            }
        }, REFRESH_MS)
    } else {
        const tick = () => {
            if (!ctx.paused && !document.hidden) dispatch(def.demo ? def.demo(ctx) : randomDemoEvent(kinds), { demo: true })
            setTimeout(tick, def.demoIntervalMs ?? 1500)
        }
        setTimeout(tick, 400)
    }
    return ctx
}
