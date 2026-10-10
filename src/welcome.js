/**
 * Karşılama ekranı (WELCOME): yayına katılan izleyiciyi kurallarla eşleştirir, ilk eşleşen kuralın
 * videosunu oynatır. Her izleyici yayın (oda) başına bir kez karşılanır; videolar sırayla oynar.
 *
 * Koşullar (hepsi sağlanmalı):
 *   nickname | username : equals · contains · not_contains (harf duyarsız; username'de `@` yok sayılır)
 *   level | fan_club_level : gte
 *   fan_club : member
 */
import { createOverlay } from './index.js'
import { playMedia, createQueue } from './media.js'
import { demoEvent, demoUser } from './demo.js'
import { num, handle, template } from './util.js'

function text(field, value) {
    return field === 'username' ? handle(value) : String(value ?? '').trim().toLowerCase()
}

export function matchesCondition(c, actor = {}) {
    switch (c?.field) {
        case 'nickname':
        case 'username': {
            const have = text(c.field, c.field === 'username' ? actor.username : (actor.nickname ?? actor.username))
            const want = text(c.field, c.value)
            if (c.op === 'equals') return Boolean(want) && have === want
            if (c.op === 'contains') return Boolean(want) && have.includes(want)
            if (c.op === 'not_contains') return !want || !have.includes(want)
            return false
        }
        case 'level':
            return actor.level != null && num(actor.level) >= num(c.value)
        case 'fan_club_level':
            return actor.fanClubLevel != null && num(actor.fanClubLevel) >= num(c.value)
        case 'fan_club':
            return Boolean(actor.fanClubName) || num(actor.fanClubLevel) > 0
        default:
            return false
    }
}

export function matchesRule(rule, actor) {
    const conditions = rule?.conditions ?? []
    return conditions.length > 0 && conditions.every((c) => matchesCondition(c, actor))
}

/** İlk eşleşen kural (`sortOrder` sırası). */
export function findRule(rules, actor) {
    return [...(rules ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).find((r) => matchesRule(r, actor)) ?? null
}

/** Demo: kuralı sağlayan sahte izleyici. */
export function demoActorFor(rule) {
    const actor = demoUser()
    for (const c of rule?.conditions ?? []) {
        const value = String(c.value ?? '')
        if (c.field === 'nickname' && c.op === 'equals') actor.nickname = value
        if (c.field === 'nickname' && c.op === 'contains') actor.nickname = `${value} ✨`
        if (c.field === 'username' && c.op === 'equals') actor.username = handle(value)
        if (c.field === 'username' && c.op === 'contains') actor.username = `${handle(value)}_tv`
        if (c.field === 'level') actor.level = num(value) + 3
        if (c.field === 'fan_club') Object.assign(actor, { fanClubName: 'Ember', fanClubLevel: Math.max(actor.fanClubLevel ?? 0, 3) })
        if (c.field === 'fan_club_level') Object.assign(actor, { fanClubName: 'Ember', fanClubLevel: num(value) + 1 })
    }
    return actor
}

/**
 * @param {object} [opts]
 * @param {HTMLElement} [opts.stage]
 * @param {(stage, actor, rule, ctx) => (() => void) | void} [opts.decorate]  video sırasında isim kartı vb.; temizleyici döndürebilir
 */
export function createWelcomeOverlay(opts = {}) {
    const queue = createQueue({ max: 20 })
    const greeted = new Set()
    let roomId = null
    let stage
    let demoIndex = 0

    function play(ctx, rule, actor) {
        queue.push(async () => {
            const cleanup = opts.decorate?.(stage, actor, rule, ctx)
            try {
                await playMedia(stage, { url: rule.mediaUrl, type: rule.mediaType, volume: rule.volume ?? 100, maxMs: 30_000, className: 'se-welcome-video' })
            } finally {
                if (typeof cleanup === 'function') cleanup()
            }
        })
    }

    return createOverlay({
        events: ['join'],
        demoIntervalMs: 6000,
        async init(ctx) {
            stage = opts.stage ?? ctx.root
            await opts.init?.(ctx)
        },
        onEvent(event, ctx, meta) {
            const actor = event.actor ?? {}
            const room = event.stream?.roomId ?? null
            if (room && room !== roomId) {
                roomId = room
                greeted.clear()
            }
            const viewer = String(actor.id ?? actor.username ?? '')
            if (!meta.demo && (!viewer || greeted.has(viewer))) return
            const rule = event.__rule ?? findRule(ctx.welcome, actor)
            if (!rule) return
            if (viewer) greeted.add(viewer)
            play(ctx, rule, actor)
        },
        demo(ctx) {
            if (queue.size || !ctx.welcome?.length) return null
            const rule = ctx.welcome[demoIndex++ % ctx.welcome.length]
            return { ...demoEvent('join', { actor: demoActorFor(rule) }), __rule: rule }
        },
        onTrigger(payload, ctx) {
            if (!payload.ruleUuid) return false
            const rule = ctx.welcome?.find((r) => r.id === payload.ruleUuid)
            if (rule) play(ctx, rule, demoActorFor(rule))
            return true
        },
        onReset() {
            queue.clear()
            greeted.clear()
            stage?.replaceChildren()
        },
        onConfig: opts.onConfig
    })
}

