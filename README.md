# overlay-core-web

StreamEmber yayın overlay'lerinin (OBS / TikTok LIVE Studio tarayıcı kaynağı) ortak çekirdeği.
npm: [`@streamemberplatform/overlay-core-web`](https://www.npmjs.com/package/@streamemberplatform/overlay-core-web) ·
CDN: `https://cdn.jsdelivr.net/npm/@streamemberplatform/overlay-core-web@1.0.0/src/index.js`

Derleme adımı yok: düz ES modülleri, bağımlılık yok. Overlay'ler paketi importmap ile CDN'den yükler.

```html
<script type="importmap">
  { "imports": { "@streamemberplatform/overlay-core-web": "https://cdn.jsdelivr.net/npm/@streamemberplatform/overlay-core-web@1/src/index.js" } }
</script>
<script type="module" src="./overlay.js"></script>
```

```js
import { createOverlay, createLeaderboard } from '@streamemberplatform/overlay-core-web'

createOverlay({
  events: ['like'],             // dinlenecek kanonik türler; yoksa manifest.json `events`
  init(ctx) {},                 // ctx: { mode, kind, key, slot, config, variant, manifest, user, welcome, root }
  onEvent(event, ctx, meta) {}, // EventFabric normalize olayı; meta.demo / meta.replayed
  onReset(ctx) {},
  onConfig(ctx) {},             // varyant / ayar / kurallar değişti
})
```

Hazır motorlar: `createScreenOverlay()` (aksiyon ekranı — otomasyon kurallarını değerlendirir, yalnız kendi ekran
numarasının görsel/ses adımlarını oynatır) ve `createWelcomeOverlay()` (yayına katılan izleyiciyi karşılama
kurallarıyla eşleştirip video oynatır). Yardımcılar: `createLeaderboard`, `createQueue`, `playMedia`, `template`,
`demoEvent`, `demoUser`, `fnv1a32`.

## Açılış modları

| Adres | Mod |
|---|---|
| `https://overlay.streamember.com/0xKEY` | canlı — sunucu `window.__SE_OVERLAY__` gömer, EventFabric'e bağlanılır |
| `…/0xKEY#demo` | kullanıcının ayarlarıyla demo (launcher önizlemesi) |
| `…/overlay-<ad>-web/` | varsayılanlarla demo |
| `…/overlay-<ad>-web/?key=0xKEY` | geliştirme: boot verisi `/api/resolve/{key}` |

`#demo&variant=neon` varyantı ezer. Ayar: alan varsayılanı ← varyant `defaults` ← link `config`.

## Launcher kontrolü (postMessage)

`{ type: 'streamember:overlay', action, payload }` — `reset`, `trigger` (`{}` | `{ event }` | `{ ruleUuid }` | `{ actionId }`),
`setVariant {variant}`, `setConfig {config}`, `reload`, `pause`, `resume`. Overlay hazır olunca üst pencereye
`{ type, action: 'ready', payload: { kind, key } }` yollar. Yalnız `window.parent`'tan gelen mesajlar dinlenir.

Tam sözleşme (Falcon ⇄ launcher ⇄ overlay sitesi ⇄ SDK): `StreamEmber/Overlay/docs/CONTRACT.md`.

## Sürüm ve yayın

```bash
npm test
# CHANGELOG.md güncelle
npm version 1.0.1        # package.json + src/index.js SDK_VERSION + README, commit + v1.0.1 etiketi
git push --follow-tags   # Release iş akışı npm'e yayınlar ve GitHub Release açar
```

Overlay'ler `@1` aralığını kullanır: 1.x sürümleri kendiliğinden gelir, kırıcı değişiklik `2.0.0` olarak yayınlanır ve
overlay importmap'leri bilinçli olarak güncellenir. jsDelivr aralık önbelleğini hemen tazelemek için:
`https://purge.jsdelivr.net/npm/@streamemberplatform/overlay-core-web@1/src/index.js`.

Otomasyon eşleştirmesi (`src/automation.js`) launcher `AutomationRuleEngine.ts` ile birebir aynı kalmalıdır.
