/**
 * Otomasyon kural eşleştirmesi — launcher `modules/automation/services/AutomationRuleEngine.ts` ile
 * BİREBİR aynı olmalı (aynı olayda iki taraf aynı kuralı / aynı rastgele aksiyonu seçer):
 * - RANDOM_ONE: fnv1a32(event.id + '|' + rule.id) % actions.length
 * - cooldown zamanı: Number(event.occurredAtUnixMs) || Date.now()
 */
import { fnv1a32, num, handle } from './util.js'

const PLATFORMS = { tiktok: 'TIKTOK', youtube: 'YOUTUBE', twitch: 'TWITCH', kick: 'KICK' }
const SIMPLE_TRIGGERS = {
    join: 'JOIN',
    follow: 'FOLLOW',
    share: 'SHARE',
    subscribe: 'SUBSCRIBE',
    resubscribe: 'SUBSCRIBE',
    subscription_gift: 'COMMUNITY_GIFT',
    raid: 'RAID',
    reward_redeem: 'REWARD_REDEEM'
}
const MAX_REPEAT = 20

export function describe(event) {
    const kind = String(event.kind ?? '')
    const platform = PLATFORMS[String(event.platform ?? '').toLowerCase()]
    if (!kind || !platform) return null
    let units = 1
    let unitValue = 0
    let eventName = kind
    if (kind === 'gift') {
        const gift = event.gift
        if (!gift?.giftId) return null
        units = gift.streak?.state ? num(gift.streak.deltaCount) : Math.max(1, num(gift.count))
        if (units <= 0) return null
        unitValue = num(gift.unitValue)
        eventName = gift.name ?? gift.giftId
    } else if (kind === 'donation') {
        unitValue = num(event.gift?.unitValue)
        eventName = event.gift?.name ?? 'donation'
    } else if (kind === 'like') {
        units = Math.max(1, num(event.engagement?.count))
    }
    const actor = event.actor ?? {}
    return {
        platform,
        kind,
        catalogId: String(event.catalogId ?? ''),
        units,
        unitValue,
        text: String(event.chat?.text ?? ''),
        userId: String(actor.id ?? actor.username ?? ''),
        username: String(actor.username ?? '').toLowerCase(),
        nickname: String(actor.nickname ?? actor.username ?? ''),
        eventName,
        follower: Boolean(actor.follower),
        subscriber: Boolean(actor.subscriber),
        moderator: Boolean(actor.moderator)
    }
}

const same = (a, b) => Boolean(a && b) && a.trim().toLowerCase() === b.trim().toLowerCase()

function triggerMatches(rule, facts) {
    const trigger = rule.triggerType
    const simple = SIMPLE_TRIGGERS[facts.kind]
    if (simple) return trigger === simple
    if (facts.kind === 'like') return trigger === 'LIKE' && (rule.minCount == null || facts.units >= rule.minCount)
    if (facts.kind === 'comment') {
        if (trigger !== 'COMMENT') return false
        const text = facts.text.trim().toLowerCase()
        const terms = (rule.commentTerms ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)
        switch (rule.commentMatch ?? 'ANY') {
            case 'COMMAND':
                return terms.some((t) => text === t || text.startsWith(`${t} `))
            case 'CONTAINS':
                return terms.some((t) => text.includes(t))
            case 'EXACT':
                return terms.includes(text)
            default:
                return true
        }
    }
    if (facts.kind === 'donation') {
        if (trigger !== 'SUPER_CHAT' && trigger !== 'CHEER') return false
        return rule.minValue == null || facts.unitValue >= rule.minValue
    }
    if (facts.kind === 'gift') {
        if (trigger === 'GIFT') return rule.minValue == null || facts.unitValue >= rule.minValue
        if (trigger === 'GIFT_SPECIFIC') return Boolean(facts.catalogId) && (rule.gifts ?? []).some((g) => same(g.giftId, facts.catalogId))
    }
    return false
}

function audienceMatches(rule, facts) {
    const a = rule.audience ?? { everyone: true, allowedUsers: [], blockedUsers: [] }
    const name = facts.username
    if ((a.blockedUsers ?? []).some((u) => handle(u) === name)) return false
    if (a.everyone) return true
    if ((a.allowedUsers ?? []).some((u) => handle(u) === name)) return true
    return (a.followers && facts.follower) || (a.subscribers && facts.subscriber) || (a.moderators && facts.moderator)
}

/** Kural motoru. `match(event)` → çalışacak `{ action, facts }` listesi (tekrarlar açılmış halde). */
export function createAutomationEngine() {
    let events = []
    let actionById = new Map()
    const lastRun = new Map()
    const lastUserRun = new Map()
    return {
        setRules(data) {
            events = (data?.events ?? []).filter((e) => e.enabled !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            actionById = new Map((data?.actions ?? []).map((a) => [a.id, a]))
        },
        get actions() {
            return [...actionById.values()]
        },
        action(id) {
            return actionById.get(id) ?? null
        },
        match(event) {
            const facts = describe(event)
            if (!facts) return []
            const now = Number(event.occurredAtUnixMs) || Date.now()
            const out = []
            for (const rule of events) {
                if (rule.platform !== facts.platform) continue
                if (!triggerMatches(rule, facts) || !audienceMatches(rule, facts)) continue
                const run = rule.run ?? {}
                const userKey = `${rule.id}|${facts.userId}`
                if (run.cooldownSeconds > 0 && now - (lastRun.get(rule.id) ?? 0) < run.cooldownSeconds * 1000) continue
                if (run.userCooldownSeconds > 0 && now - (lastUserRun.get(userKey) ?? 0) < run.userCooldownSeconds * 1000) continue
                lastRun.set(rule.id, now)
                lastUserRun.set(userKey, now)
                if (lastUserRun.size > 5000) lastUserRun.delete(lastUserRun.keys().next().value)

                const actions = (run.actionIds ?? []).map((id) => actionById.get(id)).filter((a) => a && a.enabled !== false)
                if (!actions.length) continue
                const chosen = run.mode === 'RANDOM_ONE' ? [actions[fnv1a32(`${event.id}|${rule.id}`) % actions.length]] : actions
                const repeat = facts.kind === 'gift' && run.comboMode === 'PER_COUNT' ? Math.min(MAX_REPEAT, facts.units, run.comboMaxRepeat ?? MAX_REPEAT) : 1
                for (let i = 0; i < repeat; i++) for (const action of chosen) out.push({ action, facts })
            }
            return out
        }
    }
}
