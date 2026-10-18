# Değişiklik günlüğü

Sürümler [SemVer](https://semver.org/lang/tr/) izler. CDN'de her zaman tam sürüm kullanın (`@1.1.0`).

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
