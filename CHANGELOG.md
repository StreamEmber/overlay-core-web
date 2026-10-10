# Değişiklik günlüğü

Sürümler [SemVer](https://semver.org/lang/tr/) izler.

## 1.0.0 — 2026-10-10
- İlk sürüm: `createOverlay` (canlı / demo modları, `window.__SE_OVERLAY__` ve `?key=` açılışı, varyant CSS'i,
  ayar birleştirme, EventFabric akışı ve yeniden bağlanma, launcher postMessage kontrolü, 60 sn'de bir tazeleme).
- `createScreenOverlay`: otomasyon kural motoru (launcher ile aynı; RANDOM_ONE `fnv1a32`, cooldown olay zamanıyla),
  animasyon / görsel / video / ses / mesaj adımları.
- `createWelcomeOverlay`: koşullu karşılama (görünen ad, kullanıcı adı, seviye, hayran kulübü), yayın başına bir kez.
- Yardımcılar: `createLeaderboard`, `createQueue`, `playMedia` (video, ses, görsel, Lottie), demo olay üretici.
