/** Küçük yardımcılar. Launcher ile birebir aynı olması gerekenler: fnv1a32 (otomasyon RANDOM_ONE seçimi). */

/** 32-bit FNV-1a (UTF-16 kod birimleri üzerinden) — launcher `shared/utils/fnv1a32.ts` ile aynı. */
export function fnv1a32(text) {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h >>> 0
}

export const num = (value) => {
    const n = Number(value ?? 0)
    return Number.isFinite(n) ? n : 0
}

/** `{nickname}`, `{username}`, `{value}` … yer tutucularını doldurur; bilinmeyenler olduğu gibi kalır. */
export function template(text, values) {
    return String(text ?? '').replace(/\{(\w+)\}/g, (all, name) => (values?.[name] ?? all) + '')
}

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
function setPath(obj, path, value) {
    const keys = path.split('.')
    let o = obj
    for (const k of keys.slice(0, -1)) o = o[k] && typeof o[k] === 'object' ? o[k] : (o[k] = {})
    o[keys.at(-1)] = value
}

/** Ayar: alan varsayılanı ← varyant `defaults` ← link `config` (launcher `overlayConfig.ts` ile aynı kural). */
export function mergeConfig(manifest, variantId, linkConfig) {
    const out = {}
    for (const field of manifest?.settings?.fields ?? []) {
        const path = field.path || field.id
        if (path && field.default !== undefined) setPath(out, path, structuredClone(field.default))
    }
    const variant = (manifest?.variants ?? []).find((v) => v.id === variantId)
    for (const source of [variant?.defaults, linkConfig]) {
        for (const [path, value] of flatten(source ?? {})) setPath(out, path, value)
    }
    return out
}

function flatten(obj, prefix = '', out = []) {
    for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, path, out)
        else out.push([path, v])
    }
    return out
}

export { getPath }

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Kullanıcı adı karşılaştırması: `@` atılır, küçük harf. */
export const handle = (value) => String(value ?? '').replace(/^@+/, '').trim().toLowerCase()
