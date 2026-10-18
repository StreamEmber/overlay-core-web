# overlay-core-web

StreamEmber yayın overlay'lerinin (OBS / TikTok LIVE Studio tarayıcı kaynağı) ortak çekirdeği.
Bağlantı, kimlik, yeniden bağlanma, demo modu, ayar ve launcher kontrolü burada; overlay yalnız ne çizeceğini yazar.

- npm: [`@streamemberplatform/overlay-core-web`](https://www.npmjs.com/package/@streamemberplatform/overlay-core-web)
- CDN: `https://cdn.jsdelivr.net/npm/@streamemberplatform/overlay-core-web@1.1.0/src/index.js`

Derleme adımı ve bağımlılık yok (düz ES modülleri). **Overlay'ler paketi yalnız CDN'den, her zaman tam sürümle yükler**
(`@x.y.z`; `@1` ya da `@latest` kullanılmaz). Yerel kopya, göreli yol ya da başka bir depoya başvuru yoktur.

## Hızlı başlangıç

Bir overlay = tek klasör (`overlay-<ad>-web/`):

```
overlay-<ad>-web/
  index.html        importmap + overlay.js
  overlay.js        overlay'in kendi mantığı
  style.css
  manifest.json     tür, olaylar, boyut, varyantlar, ayarlar
  variants/<id>.css varyant (tema) stilleri
```

**index.html**

```html
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <script type="importmap">
    { "imports": { "@streamemberplatform/overlay-core-web": "https://cdn.jsdelivr.net/npm/@streamemberplatform/overlay-core-web@1.1.0/src/index.js" } }
  </script>
  <link rel="stylesheet" href="style.css">
  <script type="module" src="overlay.js"></script>
</head>
<body><div id="overlay"></div></body>
</html>
```

**overlay.js**

```js
import { createOverlay, createLeaderboard, num } from '@streamemberplatform/overlay-core-web'

const board = createLeaderboard()

createOverlay({
  events: ['like'],
  init(ctx) { /* DOM'u ctx.root içine kur */ },
  onEvent(event, ctx) {
    board.add(event.actor, Math.max(1, num(event.engagement?.count)))
    // board.top(ctx.config.maxRows) ile çiz
  },
  onReset() { board.reset() },
  onConfig(ctx) { /* ctx.config / ctx.variant değişti, yeniden çiz */ }
})
```

**manifest.json**

```json
{
  "version": 1,
  "kind": "WIDGET",
  "events": ["like"],
  "size": { "width": 420, "height": 600 },
  "variants": [
    { "id": "classic", "label": { "tr": "Klasik", "en": "Classic" } },
    { "id": "neon", "label": { "tr": "Neon", "en": "Neon" }, "defaults": { "accentColor": "#00E5FF" } }
  ],
  "settings": {
    "sections": [{ "id": "main", "label": { "tr": "Liste", "en": "List" }, "order": 0, "columns": 2 }],
    "fields": [
      { "id": "maxRows", "path": "maxRows", "sectionId": "main", "label": { "tr": "Kişi", "en": "Rows" },
        "type": "integer", "control": "slider", "default": 5, "order": 10, "constraints": { "min": 3, "max": 15, "step": 1 } },
      { "id": "accentColor", "path": "accentColor", "sectionId": "main", "label": { "tr": "Vurgu", "en": "Accent" },
        "type": "color", "control": "color-picker", "default": "#FF3D7F", "order": 20 }
    ]
  }
}
```

- `kind`: `WIDGET` (galeri overlay'i) · `SCREEN` (aksiyon ekranı) · `WELCOME` (karşılama).
- `events`: dinlenecek kanonik olay türleri (`join`, `comment`, `like`, `follow`, `share`, `gift`, `subscribe`, …).
- `size`: overlay'in tasarım boyutu; launcher önizlemesi bu boyuttan ölçekler.
- `settings`: launcher ayar ekranını çizen şema (alan `path` = ayar anahtarı, `default` = varsayılan).
- Ayar birleştirme: alan `default` ← varyant `defaults` ← kullanıcının kaydettiği ayar → `ctx.config`.

## Açılış modları

Çekirdek modu kendisi seçer:

| Adres | Mod |
|---|---|
| `https://overlay.streamember.com/0xKEY` | **canlı** — sunucu kullanıcı verisini gömer, EventFabric'e bağlanılır |
| `https://overlay.streamember.com/0xKEY#demo` | **demo** — kullanıcının varyant/ayar/kurallarıyla, sahte olaylar (launcher önizlemesi) |
| `https://overlay.streamember.com/overlay-<ad>-web/` | **demo** — varsayılanlarla |
| `…/overlay-<ad>-web/?key=0xKEY` | geliştirme: kullanıcı verisi `/api/resolve/{key}`'den okunur |

`#demo&variant=neon` varyantı ezer. Varyant değişince `<html data-variant="neon">` olur ve `variants/neon.css` yüklenir.
Ayrıca `<html>` üzerinde `data-mode` (`live|demo`), `data-kind`, `data-status` (bağlantı) ve `data-paused` bulunur.
Kilitli overlay (abonelik gerekli) canlıda hiçbir şey çizmez.

## API

### `createOverlay(def) → Promise<ctx>`

| `def` alanı | Açıklama |
|---|---|
| `events?: string[]` | Dinlenecek türler; yoksa `manifest.events`. |
| `init?(ctx)` | Bir kez, ilk olaydan önce. |
| `onEvent?(event, ctx, meta)` | Olay geldi. `meta.demo` (sahte olay), `meta.replayed` (yeniden bağlanınca tekrar gelen). |
| `onReset?(ctx)` | Launcher "Sıfırla". |
| `onConfig?(ctx)` | Varyant, ayar ya da kurallar değişti. |
| `demo?(ctx) → event \| null` | Demo olayı üretir; `null` bu turu atlar. Yoksa manifest türlerinden rastgele olay. |
| `demoIntervalMs?: number` | Demo olay aralığı (varsayılan 1500). |
| `onTrigger?(payload, ctx) → boolean` | Launcher "Test"; `true` = işlendi. |
| `onRefresh?(ctx)` | Canlıda dakikada bir (ör. kuralları tazele). |

`ctx`: `mode`, `kind`, `key`, `slot` (aksiyon ekranı numarası), `name`, `customerUuid`, `user { displayName, avatarUrl, language }` (language: yayıncının launcher dili, ör. `tr`),
`manifest`, `variant`, `config`, `linkConfig`, `welcome` (karşılama kuralları), `paused`, `status`, `root` (`#overlay`),
`emit(event)` (olayı elle işlet).

### Hazır motorlar

- `createScreenOverlay({ init?, onConfig?, stage? })` — aksiyon ekranı. Kullanıcının otomasyon kurallarını değerlendirir,
  yalnız `overlayScreen === ctx.slot` olan aksiyonların animasyon, görsel, video, ses ve mesaj adımlarını sırayla oynatır
  (`ctx.config.maxQueue`).
- `createWelcomeOverlay({ init?, onConfig?, stage?, decorate? })` — karşılama. Yayına katılan izleyiciyi kurallarla eşleştirir
  (ilk eşleşen kazanır, her izleyici yayın başına bir kez), kuralın videosunu kuralın ses seviyesiyle oynatır.
  `decorate(stage, actor, rule, ctx)` video süresince ek öğe (isim kartı) ekleyip temizleyici döndürebilir.
  Koşullar: `nickname` / `username` → `equals | contains | not_contains`; `level` / `fan_club_level` → `gte`; `fan_club` → `member`.

### Yardımcılar

| Ad | Açıklama |
|---|---|
| `createLeaderboard()` | `add(user, amount)`, `top(n)`, `reset()` — izleyici sıralaması |
| `createQueue({ max })` | `push(async () => …)` sıralı iş kuyruğu, `clear()`, `setMax(n)` |
| `playMedia(container, { url, type?, volume?, durationMs?, maxMs?, className? })` | Video, ses, görsel ya da Lottie (`.json`) oynatır; bitince kaldırır |
| `template(text, values)` | `{nickname}`, `{username}`, `{value}` … yer tutucuları |
| `demoEvent(kind, overrides?)`, `demoUser()`, `randomDemoEvent(kinds)`, `avatar(name)` | Sahte veri |
| `num`, `handle`, `mergeConfig`, `fnv1a32`, `matchesRule`, `findRule` | Küçük yardımcılar |

## Olay biçimi

EventFabric normalize olayı (protobuf JSON, camelCase; 64-bit sayılar metin):

```js
{
  id, platform: 'tiktok' | 'youtube' | 'twitch' | 'kick',
  kind: 'like',                  // kanonik tür
  type: 'like_received',         // iç tür
  catalogId: 'tiktok.like',      // hediyede 'tiktok.gift.5655'
  occurredAtUnixMs: '1760000000000',
  stream: { roomId, target },
  actor: { id, username, nickname, avatarUrl, level, fanClubName, fanClubLevel, follower, subscriber, moderator },
  engagement: { count },         // like
  chat: { text },                // comment
  gift: { giftId, name, unitValue, count, iconUrl, streak: { state, deltaCount } }
}
```

## Launcher kontrolü

Launcher overlay'i iframe'de açar ve `postMessage` ile yönetir. Yalnız `window.parent`'tan gelen mesajlar dinlenir.

```js
{ type: 'streamember:overlay', action, payload }
```

| `action` | `payload` |
|---|---|
| `reset` | — |
| `trigger` | `{}` rastgele demo olayı · `{ event }` · `{ ruleUuid }` (karşılama) · `{ actionId }` (aksiyon ekranı) |
| `setVariant` | `{ variant }` |
| `setConfig` | `{ config }` (yalnız varsayılandan farklı alanlar) |
| `reload` · `pause` · `resume` | — |

Overlay hazır olunca üst pencereye `{ type: 'streamember:overlay', action: 'ready', payload: { kind, key } }` yollar.

## Sürüm ve yayın

CDN'de her zaman tam sürüm kullanılır (`@x.y.z`). Yeni sürüm çıkınca overlay'lerin importmap'i bilinçli olarak güncellenir.

```bash
npm test
# CHANGELOG.md güncelle
npm version 1.0.1        # package.json, src/index.js SDK_VERSION, README ve CHANGELOG'daki sürüm, commit + etiket
git push --follow-tags   # Release iş akışı npm'e yayınlar ve GitHub Release açar
```
