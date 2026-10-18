// Sürüm numarasını package.json'dan görünen yerlere yazar.
// `npm version x.y.z` bunu kendiliğinden çalıştırır (package.json > scripts.version).
// Elle: node tools/set-version.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const SEMVER = String.raw`\d+\.\d+\.\d+`
const rules = [
    ['src/index.js', new RegExp(String.raw`(export const SDK_VERSION = ')${SEMVER}(')`), `$1${version}$2`],
    ['README.md', new RegExp(String.raw`(StreamEmber/overlay-core-web@)${SEMVER}`, 'g'), `$1${version}`],
    ['CHANGELOG.md', new RegExp(String.raw`(tam sürüm kullanın \(\`@)${SEMVER}`), `$1${version}`]
]
for (const [file, re, to] of rules) {
    const p = path.join(root, file)
    const src = await readFile(p, 'utf8')
    if (!re.test(src)) console.warn(`  ! ${file}: sürüm kalıbı bulunamadı`)
    const out = src.replace(re, to)
    if (out !== src) {
        await writeFile(p, out)
        console.log(`  ${file} -> ${version}`)
    }
}
