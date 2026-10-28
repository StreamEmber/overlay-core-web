/**
 * Aksiyon ekranı (SCREEN): otomasyon kurallarını kendisi değerlendirir, yalnızca
 * `action.overlayScreen === slot` olan aksiyonların görsel/ses özelliklerini oynatır.
 * Yerel adımlar (tuş, OBS, RCON …) launcher'da çalışır.
 */
import { createOverlay } from './index.js'
import { createAutomationEngine } from './automation.js'
import { playMedia, createQueue } from './media.js'
import { playEmbed } from './embed.js'
import { demoEvent } from './demo.js'
import { template } from './util.js'

const RULES_MS = 5_000
const secs = (value) => (value ? Number(value) * 1000 : null)

const DEMO_TEXT = {
    en: ['Screen', '{nickname} triggered an action'],
    tr: ['Ekran', '{nickname} bir aksiyon tetikledi']
}
function demoMessage(ctx) {
    const lang = String(new URLSearchParams(location.hash.slice(1)).get('lang') || ctx.user?.language || 'en').slice(0, 2)
    const [screen, text] = DEMO_TEXT[lang] ?? DEMO_TEXT.en
    return { title: `${screen} ${ctx.slot || 1}`, text, durationSeconds: 3 }
}

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
    if (f.video?.embed) tasks.push(playEmbed(stage, f.video.embed, { volume, startSeconds: f.video.startSeconds, endSeconds: f.video.endSeconds, maxMs, className: 'se-video' }))
    else if (f.video?.media?.url) tasks.push(playMedia(stage, { url: f.video.media.url, type: 'VIDEO', volume, maxMs, startSeconds: f.video.startSeconds, endSeconds: f.video.endSeconds, className: 'se-video' }))
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

    let version = null
    /** Kurallar yalnız profil ya da içerik değişince yeniden kurulur (profil değişimi = başka `profileId`). */
    async function loadRules(ctx) {
        if (!ctx.key) return
        try {
            const response = await fetch(`/api/automation/${ctx.key}${ctx.mode === 'demo' ? '?fresh=1' : ''}`, { cache: 'no-store' })
            if (!response.ok) return
            const rules = await response.json()
            const next = `${rules.profileId}|${rules.updatedAt}`
            if (next === version) return
            version = next
            engine.setRules(rules)
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
            // Launcher'da profil değişince ekran en geç RULES_MS içinde yeni profilin aksiyonlarını oynatır.
            if (ctx.mode === 'live') setInterval(() => loadRules(ctx), RULES_MS)
            await opts.init?.(ctx)
        },
        onEvent(event, ctx, meta) {
            if (meta.demo && event.__action) return enqueue(ctx, event.__action, { nickname: event.actor?.nickname, username: event.actor?.username })
            if (meta.stale) return // dakikalar önceki hediye için şimdi aksiyon oynatılmaz
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
                : { id: 'demo', volume: 0, features: { message: demoMessage(ctx) } }
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
    })
}
