/** Demo modu: gerçekçi sahte izleyiciler ve normalize olaylar (EventFabric biçiminde). */

const NAMES = [
    ['ayse.yildiz', 'Ayşe 🌸'], ['mert_k', 'Mert'], ['zeynepp', 'Zeynep ✨'], ['can.bey', 'Can Bey'],
    ['elif_m', 'Elif'], ['burak.tr', 'Burak 🔥'], ['nisa.x', 'Nisa'], ['emre_44', 'Emre'],
    ['selin.art', 'Selin 🎨'], ['kaan_gg', 'Kaan GG'], ['deniz.dz', 'Deniz 🌊'], ['ali.reis', 'Ali Reis']
]
const COLORS = ['#FF6B3D', '#00E5FF', '#FF3D7F', '#7C5CFF', '#10B981', '#FFD166']
const GIFTS = [
    { giftId: '5655', name: 'Rose', unitValue: '1' },
    { giftId: '5827', name: 'Ice Cream Cone', unitValue: '1' },
    { giftId: '5269', name: 'TikTok', unitValue: '1' },
    { giftId: '6064', name: 'GG', unitValue: '1' },
    { giftId: '5879', name: 'Doughnut', unitValue: '30' },
    { giftId: '6104', name: 'Cap', unitValue: '99' },
    { giftId: '6267', name: 'Corgi', unitValue: '299' }
]
const COMMENTS = ['Selam 👋', 'Harika yayın!', 'GG', '🔥🔥🔥', 'Nerelisin?', 'Bu oyun ne?', 'Efsane 😂', 'Kolay gelsin']

let seq = 0
const pick = (list) => list[Math.floor(Math.random() * list.length)]

/** Baş harfli SVG avatar (dış istek yok). */
export function avatar(name, color = pick(COLORS)) {
    const letter = (String(name).replace(/[^\p{L}\p{N}]/gu, '')[0] || '?').toUpperCase()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${color}"/><text x="32" y="42" font-family="Arial,sans-serif" font-size="30" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function demoUser(overrides = {}) {
    const [username, nickname] = pick(NAMES)
    const index = NAMES.findIndex((n) => n[0] === username)
    return {
        id: String(7000000 + index),
        username,
        nickname,
        avatarUrl: avatar(nickname, COLORS[index % COLORS.length]),
        level: 5 + ((index * 7) % 40),
        follower: index % 2 === 0,
        ...overrides
    }
}

const TYPES = {
    join: 'audience_member_joined',
    comment: 'chat_message_created',
    like: 'like_received',
    follow: 'follow_received',
    share: 'share_received',
    gift: 'gift_received',
    subscribe: 'subscription_received'
}

/** Verilen kanonik türde sahte olay. */
export function demoEvent(kind, overrides = {}) {
    const event = {
        id: `demo-${Date.now()}-${++seq}`,
        platform: 'tiktok',
        kind,
        type: TYPES[kind] ?? kind,
        catalogId: `tiktok.${kind}`,
        occurredAtUnixMs: String(Date.now()),
        simulated: true,
        stream: { roomId: 'demo' },
        actor: demoUser()
    }
    if (kind === 'like') event.engagement = { count: String(5 + Math.floor(Math.random() * 25)) }
    if (kind === 'comment') event.chat = { text: pick(COMMENTS) }
    if (kind === 'gift') {
        const gift = pick(GIFTS)
        event.gift = { ...gift, count: String(1 + Math.floor(Math.random() * 3)) }
        event.catalogId = `tiktok.gift.${gift.giftId}`
    }
    return { ...event, ...overrides }
}

/** Manifest olay türlerinden rastgele biri. */
export function randomDemoEvent(kinds) {
    const usable = (kinds?.length ? kinds : ['like', 'comment', 'gift']).filter((k) => k in TYPES)
    return demoEvent(pick(usable.length ? usable : ['like']))
}
