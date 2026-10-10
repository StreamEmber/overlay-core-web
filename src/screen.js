/**
 * Aksiyon ekranı (SCREEN): otomasyon kurallarını kendisi değerlendirir, yalnızca
 * `action.overlayScreen === slot` olan aksiyonların görsel/ses özelliklerini oynatır.
 * Yerel adımlar (tuş, OBS, RCON …) launcher'da çalışır.
 */
import { createOverlay } from './index.js'
import { createAutomationEngine } from './automation.js'
import { playMedia, createQueue } from './media.js'
import { demoEvent } from './demo.js'
import { template } from './util.js'

const secs = (value) => (value ? Number(value) * 1000 : null)

export async function playAction(stage, action, facts = {}, ctx) {
    const f = action.features ?? {}
    const volume = action.volume ?? 80
    const maxMs = action.maxDurationSeconds ? action.maxDurationSeconds * 1000 : null
    const values = {
        nickname: facts.nickname ?? '',
        username: facts.username ?? '',
        value: facts.unitValue ?? '',
        count: facts.units ?? '',
        message: facts.text ?? '',
        eventName: facts.eventName ?? ''
    }
    const tasks = []
    if (f.animation?.animation?.url) tasks.push(playMedia(stage, { url: f.animation.animation.url, volume, durationMs: secs(f.animation.durationSeconds), maxMs, className: 'se-animation' }))
    if (f.image?.media?.url) tasks.push(playMedia(stage, { url: f.image.media.url, type: 'IMAGE', durationMs: secs(f.image.durationSeconds), maxMs, className: 'se-image' }))
    if (f.video?.media?.url) tasks.push(playMedia(stage, { url: f.video.media.url, type: 'VIDEO', volume, maxMs, className: 'se-video' }))
    if (f.sound?.sound?.url) tasks.push(playMedia(stage, { url: f.sound.sound.url, type: 'AUDIO', volume, maxMs }))
    if (f.message && (f.message.text || f.message.title)) tasks.push(showMessage(stage, template(f.message.title, values), template(f.message.text, values), secs(f.message.durationSeconds) ?? maxMs ?? 5000, ctx))
    // shortcut: TTS özelliği ekranda henüz seslendirilmiyor (GLE TTS bağlanınca eklenecek).
    await Promise.all(tasks)
}

async function showMessage(stage, title, text, ms, ctx) {
    const el = document.createElement('div')
    el.className = 'se-message'
    if (ctx?.config?.messageColor) el.style.color = ctx.config.messageColor
    if (title) el.appendChild(Object.assign(document.createElement('strong'), { textContent: title }))
    if (text) el.appendChild(Object.assign(document.createElement('span'), { textContent: text }))
    stage.appendChild(el)
    await new Promise((resolve) => setTimeout(resolve, ms))
    el.remove()
}

/**
 * @param {object} [opts]
 * @param {HTMLElement} [opts.stage]   oynatma alanı (varsayılan #overlay)
 */
export function createScreenOverlay(opts = {}) {
    const engine = createAutomationEngine()
    const queue = createQueue({ max: 5 })
    let stage
    let demoIndex = 0

    async function loadRules(ctx) {
        if (!ctx.key) return
        try {
            const response = await fetch(`/api/automation/${ctx.key}${ctx.mode === 'demo' ? '?fresh=1' : ''}`, { cache: 'no-store' })
            if (response.ok) engine.setRules(await response.json())
        } catch (error) {
            console.warn('[overlay] otomasyon kuralları okunamadı', error)
        }
    }
    const mine = (ctx) => engine.actions.filter((a) => a.enabled !== false && Number(a.overlayScreen) === Number(ctx.slot))
    const enqueue = (ctx, action, facts) => queue.push(() => playAction(stage, action, facts, ctx))

    return createOverlay({
        events: ['join', 'comment', 'like', 'follow', 'share', 'gift', 'subscribe', 'resubscribe', 'subscription_gift', 'donation', 'raid', 'reward_redeem'],
        demoIntervalMs: 4000,
        async init(ctx) {
            stage = opts.stage ?? ctx.root
            queue.setMax(Number(ctx.config.maxQueue) || 5)
            await loadRules(ctx)
            await opts.init?.(ctx)
        },
        onEvent(event, ctx, meta) {
            if (meta.demo && event.__action) return enqueue(ctx, event.__action, { nickname: event.actor?.nickname, username: event.actor?.username })
            for (const { action, facts } of engine.match(event)) {
                if (Number(action.overlayScreen) === Number(ctx.slot)) enqueue(ctx, action, facts)
            }
        },
        // Demo: bu ekrana bağlı aksiyonlardan sırayla; hiç yoksa ekran numarasını gösteren örnek mesaj.
        demo(ctx) {
            if (queue.size) return null
            const list = mine(ctx)
            const action = list.length
                ? list[demoIndex++ % list.length]
                : { id: 'demo', volume: 0, features: { message: { title: `Ekran ${ctx.slot || 1}`, text: '{nickname} bir aksiyon tetikledi', durationSeconds: 3 } } }
            return { ...demoEvent('gift'), __action: action }
        },
        onTrigger(payload, ctx) {
            if (!payload.actionId) return false
            const action = engine.action(payload.actionId)
            if (action) enqueue(ctx, action, {})
            return true
        },
        onReset() {
            queue.clear()
            stage?.replaceChildren()
        },
        onConfig(ctx) {
            queue.setMax(Number(ctx.config.maxQueue) || 5)
            opts.onConfig?.(ctx)
        },
        onRefresh: loadRules
    })
}
