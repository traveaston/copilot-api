import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"

const html = readFileSync(join(import.meta.dir, "../pages/index.html"), "utf8")

const KEY = "copilot-api.usage-viewer.theme"

const headScript = (): string => {
  const match = html.match(/<script id="theme-script">([\s\S]*?)<\/script>/)
  if (!match) throw new Error("theme-script not found")
  return match[1]
}

interface ThemeApi {
  preference(): string
  setPreference(preference: string): void
  next(preference: string): string
  view(preference: string): {
    icon: string
    text: string
    label: string
    title: string
  }
  onChange(fn: (preference: string) => void): void
}

interface Options {
  stored?: string | null
  getThrows?: boolean
  setThrows?: boolean
  removeThrows?: boolean
}

const setup = (options: Options = {}) => {
  const store = new Map<string, string>()
  if (options.stored != null) store.set(KEY, options.stored)
  const writes: Array<string> = []
  const localStorage = {
    getItem(key: string) {
      if (options.getThrows) throw new Error("denied")
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      if (options.setThrows) throw new Error("denied")
      writes.push(`set:${value}`)
      store.set(key, value)
    },
    removeItem(key: string) {
      if (options.removeThrows) throw new Error("denied")
      writes.push("remove")
      store.delete(key)
    },
  }
  const attrs = new Map<string, string>()
  const documentElement = {
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
  }
  const metaAttrs = new Map<string, string>([["content", "light dark"]])
  const meta = {
    setAttribute: (name: string, value: string) =>
      void metaAttrs.set(name, value),
  }
  const listeners: Array<(event: { key: string | null }) => void> = []
  const window: Record<string, unknown> = {
    addEventListener(
      type: string,
      fn: (event: { key: string | null }) => void,
    ) {
      if (type === "storage") listeners.push(fn)
    },
  }
  const context = vm.createContext({
    window,
    localStorage,
    document: {
      documentElement,
      querySelector: (selector: string) =>
        selector === 'meta[name="color-scheme"]' ? meta : null,
    },
  })
  vm.runInContext(headScript(), context)
  const theme = window.usageViewerTheme as ThemeApi
  const calls: Array<string> = []
  theme.onChange((preference) => calls.push(preference))
  return {
    theme,
    store,
    writes,
    calls,
    attr: () => attrs.get("data-theme"),
    meta: () => metaAttrs.get("content"),
    fire: (key: string | null) => listeners.forEach((fn) => fn({ key })),
  }
}

describe("usage viewer head script: initial state", () => {
  test("nothing stored is Auto", () => {
    const page = setup()
    expect(page.theme.preference()).toBe("auto")
    expect(page.attr()).toBeUndefined()
    expect(page.meta()).toBe("light dark")
  })

  test("light stored forces light", () => {
    const page = setup({ stored: "light" })
    expect(page.theme.preference()).toBe("light")
    expect(page.attr()).toBe("light")
    expect(page.meta()).toBe("light")
  })

  test("dark stored forces dark", () => {
    const page = setup({ stored: "dark" })
    expect(page.theme.preference()).toBe("dark")
    expect(page.attr()).toBe("dark")
    expect(page.meta()).toBe("dark")
  })

  test("an unknown stored value is Auto", () => {
    const page = setup({ stored: "sepia" })
    expect(page.theme.preference()).toBe("auto")
    expect(page.attr()).toBeUndefined()
  })

  test("a throwing getItem is Auto", () => {
    const page = setup({ getThrows: true })
    expect(page.theme.preference()).toBe("auto")
    expect(page.attr()).toBeUndefined()
    expect(page.meta()).toBe("light dark")
  })
})

describe("usage viewer head script: cycling", () => {
  test("Auto -> Light -> Dark -> Auto stores, applies and notifies", () => {
    const page = setup()
    const step = () =>
      page.theme.setPreference(page.theme.next(page.theme.preference()))

    step()
    expect(page.theme.preference()).toBe("light")
    expect(page.writes).toEqual(["set:light"])
    expect(page.attr()).toBe("light")
    expect(page.meta()).toBe("light")
    expect(page.calls).toEqual(["light"])

    step()
    expect(page.theme.preference()).toBe("dark")
    expect(page.writes).toEqual(["set:light", "set:dark"])
    expect(page.attr()).toBe("dark")
    expect(page.meta()).toBe("dark")
    expect(page.calls).toEqual(["light", "dark"])

    step()
    expect(page.theme.preference()).toBe("auto")
    expect(page.writes).toEqual(["set:light", "set:dark", "remove"])
    expect(page.store.has(KEY)).toBe(false)
    expect(page.attr()).toBeUndefined()
    expect(page.meta()).toBe("light dark")
    expect(page.calls).toEqual(["light", "dark", "auto"])
  })

  test("a throwing setItem still applies and notifies", () => {
    const page = setup({ setThrows: true })
    page.theme.setPreference("dark")
    expect(page.theme.preference()).toBe("dark")
    expect(page.attr()).toBe("dark")
    expect(page.meta()).toBe("dark")
    expect(page.calls).toEqual(["dark"])
  })

  test("a throwing removeItem still applies and notifies", () => {
    const page = setup({ stored: "dark", removeThrows: true })
    page.theme.setPreference("auto")
    expect(page.theme.preference()).toBe("auto")
    expect(page.attr()).toBeUndefined()
    expect(page.meta()).toBe("light dark")
    expect(page.calls).toEqual(["auto"])
  })
})

describe("usage viewer head script: tab sync", () => {
  test("a storage event for the key re-reads, applies and notifies", () => {
    const page = setup()
    page.store.set(KEY, "dark")
    page.fire(KEY)
    expect(page.theme.preference()).toBe("dark")
    expect(page.attr()).toBe("dark")
    expect(page.meta()).toBe("dark")
    expect(page.calls).toEqual(["dark"])
  })

  test("a storage event with a null key reads Auto once cleared", () => {
    const page = setup({ stored: "light" })
    page.store.clear()
    page.fire(null)
    expect(page.theme.preference()).toBe("auto")
    expect(page.attr()).toBeUndefined()
    expect(page.meta()).toBe("light dark")
    expect(page.calls).toEqual(["auto"])
  })

  test("a storage event for another key is ignored", () => {
    const page = setup({ stored: "light" })
    page.store.set(KEY, "dark")
    page.fire("copilot-api.usage-viewer.x-api-key")
    expect(page.theme.preference()).toBe("light")
    expect(page.attr()).toBe("light")
    expect(page.calls).toEqual([])
  })
})

describe("usage viewer head script: view", () => {
  test("matches the spec table", () => {
    const { theme } = setup()
    expect(theme.view("auto")).toEqual({
      icon: "monitor",
      text: "Auto",
      label: "Theme: Auto",
      title: "Click for Light",
    })
    expect(theme.view("light")).toEqual({
      icon: "sun",
      text: "Light",
      label: "Theme: Light",
      title: "Click for Dark",
    })
    expect(theme.view("dark")).toEqual({
      icon: "moon",
      text: "Dark",
      label: "Theme: Dark",
      title: "Click for Auto",
    })
  })
})

describe("usage viewer <head> order", () => {
  const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"))
  const metaIndex = head.search(
    /<meta\s+name="color-scheme"\s+content="light dark"\s*\/?>/,
  )
  const scriptIndex = head.indexOf('<script id="theme-script">')

  const blockingIndexes = (): Array<number> => {
    const found: Array<number> = []
    for (const match of head.matchAll(/<script\b[^>]*>/g)) {
      const tag = match[0]
      if (!/\bsrc=/.test(tag)) continue
      if (/\b(async|defer)\b|type="module"/.test(tag)) continue
      found.push(match.index)
    }
    for (const match of head.matchAll(/<link\b[^>]*>/g)) {
      if (/rel="stylesheet"/.test(match[0])) found.push(match.index)
    }
    return found
  }

  test("the meta comes before the head script", () => {
    expect(metaIndex).toBeGreaterThanOrEqual(0)
    expect(scriptIndex).toBeGreaterThan(metaIndex)
  })

  test("both come before the first render-blocking resource", () => {
    const first = Math.min(...blockingIndexes())
    expect(Number.isFinite(first)).toBe(true)
    expect(scriptIndex).toBeLessThan(first)
  })

  test("the head script is inline and classic", () => {
    expect(head).toContain('<script id="theme-script">')
  })
})
