// node --test test/   (DOM gerektirmeyen saf mantık)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fnv1a32, mergeConfig, template } from '../src/util.js'
import { createAutomationEngine } from '../src/automation.js'
import { matchesRule, findRule } from '../src/welcome.js'

test('fnv1a32 bilinen değerler (launcher ile aynı)', () => {
    assert.equal(fnv1a32(''), 0x811c9dc5)
    assert.equal(fnv1a32('a'), 0xe40c292c)
    assert.equal(fnv1a32('foobar'), 0xbf9cf968)
})

test('mergeConfig: varsayılan ← varyant ← link', () => {
    const manifest = {
        settings: { fields: [{ path: 'title', default: 'A' }, { path: 'rows', default: 5 }, { path: 'color', default: '#fff' }] },
        variants: [{ id: 'neon', defaults: { color: '#0ff' } }]
    }
    assert.deepEqual(mergeConfig(manifest, 'neon', { rows: 8 }), { title: 'A', rows: 8, color: '#0ff' })
    assert.deepEqual(mergeConfig(manifest, 'yok', {}), { title: 'A', rows: 5, color: '#fff' })
})

test('template', () => {
    assert.equal(template('Hoş geldin {nickname} {x}', { nickname: 'Ayşe' }), 'Hoş geldin Ayşe {x}')
})

test('karşılama koşulları', () => {
    const vip = { id: '1', conditions: [{ field: 'fan_club', op: 'member', value: null }, { field: 'level', op: 'gte', value: '20' }], sortOrder: 0 }
    const name = { id: '2', conditions: [{ field: 'nickname', op: 'contains', value: 'ayşe' }], sortOrder: 1 }
    const notBot = { id: '3', conditions: [{ field: 'username', op: 'not_contains', value: '@bot' }], sortOrder: 2 }
    assert.ok(matchesRule(vip, { fanClubLevel: 2, level: 25 }))
    assert.ok(!matchesRule(vip, { fanClubLevel: 2 }), 'seviye yoksa sağlanmaz')
    assert.ok(!matchesRule({ conditions: [] }, {}), 'koşulsuz kural eşleşmez')
    assert.equal(findRule([notBot, name, vip], { nickname: 'AYŞE 🌸', username: 'x' })?.id, '2')
    assert.equal(findRule([notBot], { username: 'super_bot' }), null)
})

test('otomasyon: RANDOM_ONE deterministik, cooldown olay zamanıyla', () => {
    const engine = createAutomationEngine()
    const actions = ['a', 'b', 'c'].map((id) => ({ id, enabled: true, overlayScreen: 1 }))
    engine.setRules({
        actions,
        events: [{ id: 'r1', enabled: true, platform: 'TIKTOK', triggerType: 'JOIN', audience: { everyone: true }, run: { mode: 'RANDOM_ONE', actionIds: ['a', 'b', 'c'], cooldownSeconds: 10, userCooldownSeconds: 0 } }]
    })
    // Gerçekçi epoch zamanı: ilk olayda "son çalışma" 0 sayılır, küçük sayılar cooldown'a takılır.
    const T = 1_760_000_000_000
    const event = (id, ms) => ({ id, kind: 'join', platform: 'tiktok', occurredAtUnixMs: String(T + ms), actor: { id: 'u' } })
    const first = engine.match(event('e1', 1000))
    assert.equal(first.length, 1)
    assert.equal(first[0].action.id, actions[fnv1a32('e1|r1') % 3].id)
    assert.equal(engine.match(event('e2', 5000)).length, 0, 'cooldown')
    assert.equal(engine.match(event('e3', 12000)).length, 1)
})

test('otomasyon: kitle grupları (hayran kulübü seviyesi, hediye sırası)', () => {
    const engine = createAutomationEngine()
    const rule = (id, audience) => ({ id, enabled: true, platform: 'TIKTOK', triggerType: 'COMMENT', audience: { allowedUsers: [], blockedUsers: [], ...audience }, run: { actionIds: ['a'] } })
    engine.setRules({
        actions: [{ id: 'a', enabled: true }],
        events: [rule('fan', { fanClub: true, fanClubMinLevel: 5 }), rule('top', { topGifters: true, topGifterCount: 1 })]
    })
    const T = 1_760_000_000_000
    let n = 0
    const comment = (user, actor = {}) => ({ id: `c${++n}`, kind: 'comment', platform: 'tiktok', occurredAtUnixMs: String(T + n), stream: { target: 's' }, chat: { text: 'hi' }, actor: { id: user, username: user, ...actor } })
    const gift = (user, coins) => ({ id: `g${++n}`, kind: 'gift', platform: 'tiktok', occurredAtUnixMs: String(T + n), stream: { target: 's' }, gift: { giftId: '1', unitValue: String(coins), count: '1' }, actor: { id: user, username: user } })
    const rules = (event) => engine.match(event).map((m) => m)
    assert.equal(rules(comment('low', { fanClubLevel: 2 })).length, 0, 'seviye yetersiz')
    assert.equal(rules(comment('high', { fanClubLevel: 7 })).length, 1, 'hayran kulübü')
    engine.match(gift('big', 100))
    engine.match(gift('small', 5))
    assert.equal(rules(comment('big')).length, 1, 'ilk sıradaki')
    assert.equal(rules(comment('small')).length, 0, 'ikinci sıradaki')
})

test('gömülü video bağlantıları', async () => {
    const { parseEmbedUrl } = await import('../src/embed.js')
    const cases = [
        ['https://youtu.be/dQw4w9WgXcQ?t=42', 'youtube', 'dQw4w9WgXcQ', 42],
        ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
        ['https://vimeo.com/76979871', 'vimeo', '76979871'],
        ['https://vimeo.com/76979871/abcdef1234', 'vimeo', '76979871/abcdef1234'],
        ['https://www.dailymotion.com/video/x8abcd1_baslik', 'dailymotion', 'x8abcd1'],
        ['https://dai.ly/x8abcd1', 'dailymotion', 'x8abcd1'],
        ['https://clips.twitch.tv/FunnyClipSlug-AbC123', 'twitch', 'FunnyClipSlug-AbC123'],
        ['https://www.twitch.tv/kanal/clip/FunnyClipSlug-AbC123', 'twitch', 'FunnyClipSlug-AbC123'],
        ['https://www.twitch.tv/videos/2245678901', 'twitch', '2245678901'],
        ['https://streamable.com/moo2xy', 'streamable', 'moo2xy'],
        ['https://www.tiktok.com/@kisi/video/7311234567890123456', 'tiktok', '7311234567890123456']
    ]
    for (const [url, provider, videoId, start = null] of cases) assert.deepEqual(parseEmbedUrl(url), { provider, videoId, start }, url)
    assert.equal(parseEmbedUrl('https://example.com/video.mp4'), null)
    assert.equal(parseEmbedUrl('https://www.youtube.com/watch?v=kisa'), null)
})
