# Değişiklik günlüğü

Sürümler [SemVer](https://semver.org/lang/tr/) izler. CDN'de her zaman tam sürüm kullanın (`@1.3.0`).

## 1.3.0 — 2026-10-23
- EventFabric makineleri: `wrong_region` kalktı. `wrong_node` (yayıncı başka makinede), `node_disabled` (makine kapanıyor)
  ya da soketin üst üste 3 kez hiç açılamaması (`connect_failed`; tarayıcı el sıkışma reddinin 409/503 gövdesini göremez)
  kaydı yeniden çözer, adres değiştiyse yeni makineye bağlanır.
- Yeniden bağlanma 1, 2, 4, 8, 15, 30 sn, ±%30 rastgele sapmalı (eskisi 1–15 sn, sapmasız).
- EventFabric artık kopmada 5 dk'ya kadar geri oynatıyor: `meta.stale` (geri oynatılan, 60 sn'den eski olay) eklendi.
  Aksiyon ekranı ve karşılama `stale` olayda bir şey oynatmaz; sayaç gibi overlay'ler saymaya devam edebilir.

## 1.2.0 — 2026-10-18
- Dağıtım: paket artık npm'de değil; CDN `https://cdn.jsdelivr.net/gh/StreamEmber/overlay-core-web@1.2.0/src/index.js`
  (GitHub etiketi). Import adı `@streamember/overlay-core-web`. Depo `StreamEmber/overlay-core-web`.
- Gömülü video: `playEmbed`, `parseEmbedUrl`, `embedSrc` — YouTube, Vimeo, Dailymotion, Twitch, Streamable, TikTok.
  Aksiyon ekranı `video.embed`, karşılama `rule.embed` oynatır; yüklenen videoda `startSeconds` / `endSeconds`.
- Aksiyon ekranı kuralları canlıda 5 sn'de bir okunur ve yalnız `profileId|updatedAt` değişince yeniden kurulur:
  launcher'da profil değişince ekranlar birkaç saniyede yeni profilin aksiyonlarına geçer.

## 1.1.0 — 2026-10-17
- Bölgeler: EventFabric adresi artık sabit değil; Falcon overlay kaydının `eventFabricUrl` alanından (yayıncının
  bölgesi) okunur. 60 sn'lik tazelemede adres değişirse soket yeni adrese yeniden bağlanır (cursor bırakılır).
  `eventsUrl` ve `wss://eventfabric.streamember.com` varsayılanı kaldırıldı; adres yoksa canlı akış açılmaz.
- Hata sözleşmesi: HTTP hataları `{ status, code, message }` gövdesinden okunur (`error.code`); soket `system`
  çerçevesi `type: 'error'` ve kapanış nedeni kodu `onError` ile iletilir. `wrong_region` gelince kayıt yeniden
  çözülüp yeni bölgeye bağlanılır.

## 1.0.0 — 2026-10-10
- İlk sürüm: `createOverlay` (canlı / demo modları, `window.__SE_OVERLAY__` ve `?key=` açılışı, varyant CSS'i,
  ayar birleştirme, EventFabric akışı ve yeniden bağlanma, launcher postMessage kontrolü, 60 sn'de bir tazeleme).
- `createScreenOverlay`: otomasyon kural motoru (launcher ile aynı; RANDOM_ONE `fnv1a32`, cooldown olay zamanıyla),
  animasyon / görsel / video / ses / mesaj adımları.
- `createWelcomeOverlay`: koşullu karşılama (görünen ad, kullanıcı adı, seviye, hayran kulübü), yayın başına bir kez.
- Yardımcılar: `createLeaderboard`, `createQueue`, `playMedia` (video, ses, görsel, Lottie), demo olay üretici.
