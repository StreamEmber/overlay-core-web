# overlay-core-web — yönergeler

- Önce `../docs/AGENTS.md` (ekosistem kuralları).
- Düz ES modülü, bağımlılık ve derleme adımı yok. `src/` doğrudan npm'e ve jsDelivr'e gider; dosyalar arası import göreli (`./x.js`).
- Overlay'lerin kendi ağ kodu yazmaması için bağlantı, kimlik, yeniden bağlanma, tazeleme, demo ve launcher kontrolü burada.
- `src/automation.js` launcher `src/renderer/src/modules/automation/services/AutomationRuleEngine.ts` ile birebir aynı kalır
  (RANDOM_ONE = `fnv1a32(event.id + '|' + rule.id) % n`, cooldown zamanı `occurredAtUnixMs`). Birini değiştiren ikisini değiştirir.
- Yeni dışa açık API = `src/index.js` export'u + README'deki API tablosu + CHANGELOG + mümkünse `test/` içinde test.
- Kırıcı değişiklik major sürümdür. Overlay'ler CDN'den her zaman tam sürümle yükler (`@x.y.z`); aralık (`@1`, `@latest`) yok.
- README tek başına yeterli olmalı: overlay yazan projeler yalnız README'ye bakıp CDN'den kullanır, yerel dosyaya başvurmaz.
- Sürüm: `CHANGELOG.md` → `npm version <x.y.z>` → `git push --follow-tags` (Release iş akışı yayınlar).
- Arayüz metinleri Türkçe (UTF-8, diakritikli).
