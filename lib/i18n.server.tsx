type DeepRecord = Record<string, unknown>

export interface LocaleContextValue {
  locale: string
  messages: DeepRecord
  switchLocale: (next: string) => void
}

export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  return path.split('.').reduce((o, k) => (o as DeepRecord)?.[k], obj)
}

// Server-side helper: use inside async server components
export function makeServerT(messages: DeepRecord) {
  function t(key: string, params?: Record<string, string | number>): string {
    const val = getByPath(messages, key)
    if (typeof val !== 'string') return key
    if (!params) return val
    return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''))
  }
  t.raw = (key: string): unknown => getByPath(messages, key)
  return t
}
