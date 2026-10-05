import { afterAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

import type {
  TokenUsageSession,
  TokenUsageSessionsPage,
} from "~/lib/token-usage"

import {
  CURRENCY_SYMBOLS,
  LONG_GAP_MS,
  SESSION_EVENTS_LIMIT,
  SESSIONS_PAGE_SIZE,
  applySessionsError,
  applySessionsPage,
  buildSessionsUrl,
  createSessionsState,
  escapeHtml,
  formatActiveRange,
  formatAge,
  formatClock,
  formatCompact,
  formatCostAmount,
  formatCostList,
  formatDayLabel,
  formatDuration,
  formatInteger,
  formatShortKey,
  identityOf,
  isSameDay,
  pluralize,
  readViewParam,
  renderSessionCard,
  renderSessionsBody,
  renderSessionsMeta,
  renderSessionsPager,
  renderSessionsTabs,
  setView,
  startSessionsLoad,
  writeViewParam,
} from "../pages/usage-viewer/sessions.js"

describe("sessions module constants", () => {
  test("exports the paging and gap constants", () => {
    expect(SESSIONS_PAGE_SIZE).toBe(20)
    expect(SESSION_EVENTS_LIMIT).toBe(50)
    expect(LONG_GAP_MS).toBe(900000)
    expect(CURRENCY_SYMBOLS).toEqual({ CNY: "¥", USD: "$" })
  })
})

describe("sessions module escapeHtml", () => {
  test("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    )
  })

  test("stringifies non-string values", () => {
    expect(escapeHtml(42)).toBe("42")
    expect(escapeHtml(null)).toBe("null")
  })
})

describe("buildSessionsUrl", () => {
  test("appends /sessions with period, page and page_size", () => {
    const url = new URL(
      buildSessionsUrl("http://localhost:4141/token-usage", {
        period: "last_7_days",
        page: 3,
        pageSize: 20,
      }),
    )

    expect(url.origin + url.pathname).toBe(
      "http://localhost:4141/token-usage/sessions",
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      period: "last_7_days",
      page: "3",
      page_size: "20",
    })
  })

  test("keeps a path prefix and drops a trailing slash", () => {
    expect(
      buildSessionsUrl("https://gw.example/api/token-usage/", {
        period: "today",
        page: 1,
        pageSize: 20,
      }),
    ).toBe(
      "https://gw.example/api/token-usage/sessions?period=today&page=1&page_size=20",
    )
  })
})

describe("readViewParam", () => {
  test("view=events selects All events", () => {
    expect(readViewParam("?period=today&view=events")).toBe("events")
  })

  test("any other value, or none, selects Sessions", () => {
    expect(readViewParam("")).toBe("sessions")
    expect(readViewParam("?view=sessions")).toBe("sessions")
    expect(readViewParam("?view=EVENTS")).toBe("sessions")
    expect(readViewParam("?view=")).toBe("sessions")
  })
})

describe("writeViewParam", () => {
  test("adds view=events and keeps the other params", () => {
    const next = new URL(
      writeViewParam(
        "http://localhost:4141/?endpoint=http%3A%2F%2Fgw%2Fusage&period=today#top",
        "events",
      ),
    )

    expect(next.searchParams.get("view")).toBe("events")
    expect(next.searchParams.get("endpoint")).toBe("http://gw/usage")
    expect(next.searchParams.get("period")).toBe("today")
    expect(next.hash).toBe("#top")
  })

  test("removes view for Sessions and keeps the other params", () => {
    expect(
      writeViewParam(
        "http://localhost:4141/?period=today&view=events&x=1",
        "sessions",
      ),
    ).toBe("http://localhost:4141/?period=today&x=1")
  })
})

describe("identityOf", () => {
  test("prefixes the key by its kind", () => {
    expect(identityOf({ key: "abc", sessionless: false })).toBe("s:abc")
    expect(identityOf({ key: "abc", sessionless: true })).toBe("t:abc")
  })
})

describe("number formatters", () => {
  test("formatInteger groups digits and shows 0 for non-finite values", () => {
    expect(formatInteger(1234567)).toBe("1,234,567")
    expect(formatInteger(Number.NaN)).toBe("0")
    expect(formatInteger(Number.POSITIVE_INFINITY)).toBe("0")
  })

  test("formatCompact uses one fractional digit of compact notation", () => {
    expect(formatCompact(2412345)).toBe("2.4M")
    expect(formatCompact(85000)).toBe("85K")
    expect(formatCompact(950)).toBe("950")
  })
})

/** Local wall-clock time as epoch ms. */
function at(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  return new Date(year, month - 1, day, hour, minute, second).getTime()
}

const NOW = at(2026, 9, 29, 23, 0)

describe("date formatters", () => {
  test("formatClock is a 12-hour clock, with seconds on request", () => {
    expect(formatClock(at(2026, 9, 29, 21, 41, 7))).toBe("9:41 PM")
    expect(formatClock(at(2026, 9, 29, 21, 41, 7), { seconds: true })).toBe(
      "9:41:07 PM",
    )
    expect(formatClock(at(2026, 9, 29, 0, 5))).toBe("12:05 AM")
  })

  test("formatDayLabel adds the year only when it differs from now's", () => {
    expect(formatDayLabel(at(2026, 9, 29, 21), NOW)).toBe("Sep 29")
    expect(formatDayLabel(at(2025, 12, 31, 21), NOW)).toBe("Dec 31, 2025")
  })

  test("isSameDay compares local calendar dates", () => {
    expect(isSameDay(at(2026, 9, 29, 0, 0), at(2026, 9, 29, 23, 59, 59))).toBe(
      true,
    )
    expect(isSameDay(at(2026, 9, 28, 23, 59, 59), at(2026, 9, 29, 0, 0))).toBe(
      false,
    )
    expect(isSameDay(at(2025, 9, 29, 12), at(2026, 9, 29, 12))).toBe(false)
  })

  test("formatActiveRange names the day once on a same-day range", () => {
    expect(
      formatActiveRange(at(2026, 9, 29, 9, 2), at(2026, 9, 29, 13, 14), NOW),
    ).toBe("Sep 29 9:02 AM → 1:14 PM")
  })

  test("formatActiveRange names both days across midnight", () => {
    expect(
      formatActiveRange(at(2026, 9, 28, 21, 2), at(2026, 9, 29, 1, 14), NOW),
    ).toBe("Sep 28 9:02 PM → Sep 29 1:14 AM")
  })
})

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe("formatDuration", () => {
  test("floors to the largest two units and drops a zero second unit", () => {
    expect(formatDuration(0)).toBe("<1m")
    expect(formatDuration(59 * SECOND)).toBe("<1m")
    expect(formatDuration(60 * SECOND)).toBe("1m")
    expect(formatDuration(42 * MINUTE + 59 * SECOND)).toBe("42m")
    expect(formatDuration(HOUR - 1)).toBe("59m")
    expect(formatDuration(HOUR)).toBe("1h")
    expect(formatDuration(4 * HOUR + 12 * MINUTE + 30 * SECOND)).toBe("4h 12m")
    expect(formatDuration(DAY - 1)).toBe("23h 59m")
    expect(formatDuration(2 * DAY + 3 * HOUR + 59 * MINUTE)).toBe("2d 3h")
    expect(formatDuration(2 * DAY + 59 * MINUTE)).toBe("2d")
  })
})

describe("formatAge", () => {
  test("reads just now under a minute, or when last_ms is in the future", () => {
    expect(formatAge(NOW, NOW)).toBe("just now")
    expect(formatAge(NOW - 59 * SECOND, NOW)).toBe("just now")
    expect(formatAge(NOW + 5 * MINUTE, NOW)).toBe("just now")
  })

  test("uses the largest whole unit, floored", () => {
    expect(formatAge(NOW - 60 * SECOND, NOW)).toBe("1m ago")
    expect(formatAge(NOW - 12 * MINUTE - 59 * SECOND, NOW)).toBe("12m ago")
    expect(formatAge(NOW - HOUR + 1, NOW)).toBe("59m ago")
    expect(formatAge(NOW - HOUR, NOW)).toBe("1h ago")
    expect(formatAge(NOW - 3 * HOUR - 59 * MINUTE, NOW)).toBe("3h ago")
    expect(formatAge(NOW - 2 * DAY - 23 * HOUR, NOW)).toBe("2d ago")
  })
})

describe("formatShortKey", () => {
  test("keeps the first 8 characters, prefixed with trace when sessionless", () => {
    expect(
      formatShortKey({ key: "1a2b3c4d-5e6f-0000", sessionless: false }),
    ).toBe("1a2b3c4d")
    expect(formatShortKey({ key: "9f8e7d6c5b4a", sessionless: true })).toBe(
      "trace 9f8e7d6c",
    )
    expect(formatShortKey({ key: "abc", sessionless: false })).toBe("abc")
  })
})

describe("pluralize", () => {
  test("uses the singular only for exactly one", () => {
    expect(pluralize(1, "request")).toBe("1 request")
    expect(pluralize(0, "request")).toBe("0 requests")
    expect(pluralize(1234, "request")).toBe("1,234 requests")
    expect(pluralize(1, "event")).toBe("1 event")
    expect(pluralize(2, "event")).toBe("2 events")
  })
})

describe("formatCostAmount", () => {
  test("uses 2 decimals from 0.01 up, and at or below 0", () => {
    expect(formatCostAmount(12.3)).toBe("12.30")
    expect(formatCostAmount(0.01)).toBe("0.01")
    expect(formatCostAmount(1234.5)).toBe("1234.50")
    expect(formatCostAmount(0)).toBe("0.00")
  })

  test("keeps 2 significant digits below 0.01, with no decimal cap", () => {
    expect(formatCostAmount(0.0042)).toBe("0.0042")
    expect(formatCostAmount(4e-7)).toBe("0.00000040")
  })

  test("shows 0.01 when 2 significant digits round up to it", () => {
    expect(formatCostAmount(0.00999)).toBe("0.01")
  })
})

describe("formatCostList", () => {
  const cost = (currency: string, amount: number) => ({
    amount,
    currency,
    total_cost_nanos: Math.round(amount * 1e9),
  })

  test("prefixes known symbols and dims digits past the second decimal", () => {
    expect(formatCostList([cost("USD", 0.0042)])).toBe(
      '$0.00<span class="sessions-cost-dim">42</span>',
    )
    expect(formatCostList([cost("USD", 3.4)])).toBe("$3.40")
  })

  test("normalizes codes, sorts by code and joins with a middle dot", () => {
    expect(formatCostList([cost(" usd ", 3.4), cost("cny", 1.2)])).toBe(
      "¥1.20 · $3.40",
    )
  })

  test("writes unknown codes before the amount", () => {
    expect(formatCostList([cost("eur", 0.5), cost("USD", 1)])).toBe(
      "EUR 0.50 · $1.00",
    )
  })

  test("shows a dash for no costs or a null cost", () => {
    expect(formatCostList([])).toBe("—")
    expect(formatCostList(null)).toBe("—")
  })

  test("escapes a hostile currency code", () => {
    expect(formatCostList([cost("<b>", 1)])).toBe("&lt;B&gt; 1.00")
  })
})

function sessionOf(
  overrides: Partial<TokenUsageSession> = {},
): TokenUsageSession {
  return {
    byModel: [],
    cache_creation_input_tokens: 120_000,
    cache_read_input_tokens: 3_400_000,
    costs: [{ amount: 1.2, currency: "USD", total_cost_nanos: 1_200_000_000 }],
    endpoints: ["messages"],
    first_ms: at(2026, 9, 29, 17, 29),
    input_tokens: 1_200_000,
    key: "1a2b3c4d-5e6f-7a8b",
    last_ms: at(2026, 9, 29, 21, 41),
    output_tokens: 85_000,
    request_count: 12,
    sessionless: false,
    total_nano_aiu: null,
    total_tokens: 4_805_000,
    ...overrides,
  }
}

function sessionsPageOf(
  overrides: Partial<TokenUsageSessionsPage> = {},
): TokenUsageSessionsPage {
  return {
    items: [sessionOf()],
    page: 1,
    page_size: 20,
    period: "today",
    range: {
      end_ms: at(2026, 9, 30),
      end_utc: "",
      start_ms: at(2026, 9, 29),
      start_utc: "",
    },
    total: 1,
    total_pages: 1,
    ...overrides,
  }
}

describe("sessions list transitions", () => {
  test("createSessionsState starts available with nothing loaded", () => {
    const state = createSessionsState("events")

    expect(state.view).toBe("events")
    expect(state.available).toBe(true)
    expect(state.page).toBeNull()
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })

  test("startSessionsLoad issues one list request with a fresh id", () => {
    const initial = createSessionsState("sessions")
    const { state, requests } = startSessionsLoad(initial, {
      page: 1,
      reason: "initial",
    })

    expect(requests).toEqual([
      {
        kind: "sessions",
        page: 1,
        reason: "initial",
        requestId: expect.any(Number) as number,
      },
    ])
    expect(state.requestId).toBe(requests[0].requestId)
    expect(state.loading).toBe(true)
    expect(initial.loading).toBe(false)

    const next = startSessionsLoad(state, { page: 2, reason: "page" })
    expect(next.requests[0].requestId).not.toBe(requests[0].requestId)
  })

  test("applySessionsPage shows the latest response and ends the load", () => {
    const started = startSessionsLoad(createSessionsState("sessions"), {
      page: 1,
      reason: "initial",
    })
    const response = sessionsPageOf()
    const { state, requests } = applySessionsPage(started.state, {
      page: response,
      requestId: started.requests[0].requestId,
    })

    expect(requests).toEqual([])
    expect(state.page).toBe(response)
    expect(state.loading).toBe(false)
  })

  test("a list response whose request id isn't the latest is dropped", () => {
    const first = startSessionsLoad(createSessionsState("sessions"), {
      page: 1,
      reason: "initial",
    })
    const second = startSessionsLoad(first.state, { page: 1, reason: "period" })

    const stalePage = applySessionsPage(second.state, {
      page: sessionsPageOf({ period: "today" }),
      requestId: first.requests[0].requestId,
    })
    expect(stalePage.state).toBe(second.state)
    expect(stalePage.requests).toEqual([])

    const staleError = applySessionsError(second.state, {
      message: "boom",
      missing: false,
      requestId: first.requests[0].requestId,
    })
    expect(staleError.state).toBe(second.state)
  })
})

describe("sessions list errors", () => {
  function loaded() {
    const started = startSessionsLoad(createSessionsState("sessions"), {
      page: 1,
      reason: "initial",
    })
    const response = sessionsPageOf()
    return {
      response,
      state: applySessionsPage(started.state, {
        page: response,
        requestId: started.requests[0].requestId,
      }).state,
    }
  }

  test("a failed reload keeps the loaded page with the error above it", () => {
    const { response, state } = loaded()
    const reload = startSessionsLoad(state, { page: 2, reason: "page" })
    const failed = applySessionsError(reload.state, {
      message: "Gateway timeout",
      missing: false,
      requestId: reload.requests[0].requestId,
    }).state

    expect(failed.page).toBe(response)
    expect(failed.error).toBe("Gateway timeout")
    expect(failed.loading).toBe(false)
    expect(failed.available).toBe(true)
  })

  test("the next load clears the error", () => {
    const { state } = loaded()
    const reload = startSessionsLoad(state, { page: 1, reason: "refresh" })
    const failed = applySessionsError(reload.state, {
      message: "boom",
      missing: false,
      requestId: reload.requests[0].requestId,
    }).state

    expect(
      startSessionsLoad(failed, { page: 1, reason: "refresh" }).state.error,
    ).toBeNull()
  })

  test("a missing endpoint hides the tab without an error or touching view", () => {
    const started = startSessionsLoad(createSessionsState("sessions"), {
      page: 1,
      reason: "initial",
    })
    const missing = applySessionsError(started.state, {
      message: "Not Found",
      missing: true,
      requestId: started.requests[0].requestId,
    }).state

    expect(missing.available).toBe(false)
    expect(missing.error).toBeNull()
    expect(missing.loading).toBe(false)
    expect(missing.view).toBe("sessions")
  })

  test("a later page brings the tab back with the stored choice", () => {
    const started = startSessionsLoad(createSessionsState("events"), {
      page: 1,
      reason: "initial",
    })
    const missing = applySessionsError(started.state, {
      message: "Not Found",
      missing: true,
      requestId: started.requests[0].requestId,
    }).state
    const reload = startSessionsLoad(missing, { page: 1, reason: "refresh" })
    const back = applySessionsPage(reload.state, {
      page: sessionsPageOf(),
      requestId: reload.requests[0].requestId,
    }).state

    expect(back.available).toBe(true)
    expect(back.view).toBe("events")
  })
})

describe("lost page", () => {
  test("a page past the end re-fetches the last page once for the load", () => {
    const started = startSessionsLoad(createSessionsState("sessions"), {
      page: 4,
      reason: "refresh",
    })
    const lost = applySessionsPage(started.state, {
      page: sessionsPageOf({ items: [], page: 4, total: 41, total_pages: 3 }),
      requestId: started.requests[0].requestId,
    })

    expect(lost.requests).toEqual([
      {
        kind: "sessions",
        page: 3,
        reason: "refresh",
        requestId: expect.any(Number) as number,
      },
    ])
    expect(lost.state.requestId).toBe(lost.requests[0].requestId)
    expect(lost.state.loading).toBe(true)
    expect(lost.state.page).toBeNull()

    const last = sessionsPageOf({ page: 3, total: 41, total_pages: 3 })
    const applied = applySessionsPage(lost.state, {
      page: last,
      requestId: lost.requests[0].requestId,
    })
    expect(applied.requests).toEqual([])
    expect(applied.state.page).toBe(last)
    expect(applied.state.loading).toBe(false)
  })

  test("a re-fetch that is past the end too is applied as it is", () => {
    const started = startSessionsLoad(createSessionsState("sessions"), {
      page: 4,
      reason: "refresh",
    })
    const lost = applySessionsPage(started.state, {
      page: sessionsPageOf({ items: [], page: 4, total: 41, total_pages: 3 }),
      requestId: started.requests[0].requestId,
    })
    const stillLost = sessionsPageOf({
      items: [],
      page: 3,
      total: 15,
      total_pages: 1,
    })
    const applied = applySessionsPage(lost.state, {
      page: stillLost,
      requestId: lost.requests[0].requestId,
    })

    expect(applied.requests).toEqual([])
    expect(applied.state.page).toBe(stillLost)
  })

  test("each new load gets its own re-fetch", () => {
    const first = startSessionsLoad(createSessionsState("sessions"), {
      page: 4,
      reason: "refresh",
    })
    const lost = applySessionsPage(first.state, {
      page: sessionsPageOf({ items: [], page: 4, total: 41, total_pages: 3 }),
      requestId: first.requests[0].requestId,
    })
    const second = startSessionsLoad(lost.state, { page: 4, reason: "refresh" })
    const lostAgain = applySessionsPage(second.state, {
      page: sessionsPageOf({ items: [], page: 4, total: 41, total_pages: 3 }),
      requestId: second.requests[0].requestId,
    })

    expect(lostAgain.requests).toHaveLength(1)
  })

  test("an empty period is not a lost page", () => {
    const started = startSessionsLoad(createSessionsState("sessions"), {
      page: 2,
      reason: "refresh",
    })
    const empty = sessionsPageOf({
      items: [],
      page: 2,
      total: 0,
      total_pages: 0,
    })
    const applied = applySessionsPage(started.state, {
      page: empty,
      requestId: started.requests[0].requestId,
    })

    expect(applied.requests).toEqual([])
    expect(applied.state.page).toBe(empty)
  })
})

describe("setView", () => {
  test("switches the tab without a request or touching the list", () => {
    const started = startSessionsLoad(createSessionsState("sessions"), {
      page: 1,
      reason: "initial",
    })
    const { state, requests } = setView(started.state, "events")

    expect(requests).toEqual([])
    expect(state.view).toBe("events")
    expect(state.loading).toBe(true)
    expect(state.requestId).toBe(started.state.requestId)
    expect(started.state.view).toBe("sessions")
  })
})

const win = new Window()

afterAll(async () => {
  await win.happyDOM.close()
})

/** Parses rendered HTML into a fresh container. */
function parse(html: string) {
  const container = win.document.createElement("div")
  container.innerHTML = html
  return container
}

function loadedState(
  view: "sessions" | "events",
  page: TokenUsageSessionsPage = sessionsPageOf(),
) {
  const started = startSessionsLoad(createSessionsState(view), {
    page: page.page,
    reason: "initial",
  })
  return applySessionsPage(started.state, {
    page,
    requestId: started.requests[0].requestId,
  }).state
}

describe("renderSessionsTabs", () => {
  test("renders a labelled tablist with a roving tabindex", () => {
    const root = parse(
      renderSessionsTabs(loadedState("sessions"), { eventsCount: 42 }),
    )
    const tablist = root.querySelector('[role="tablist"]')
    const tabs = [...root.querySelectorAll('[role="tab"]')]

    expect(tablist?.getAttribute("aria-label")).toBe("Request Events")
    expect(tabs.map((tab) => tab.tagName)).toEqual(["BUTTON", "BUTTON"])
    expect(tabs.map((tab) => tab.getAttribute("type"))).toEqual([
      "button",
      "button",
    ])
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
    ])
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1"])
    expect(tabs.map((tab) => tab.getAttribute("data-session-action"))).toEqual([
      "tab",
      "tab",
    ])
    expect(tabs.map((tab) => tab.getAttribute("data-session-view"))).toEqual([
      "sessions",
      "events",
    ])
    expect(
      new Set(tabs.map((tab) => tab.getAttribute("aria-controls"))).size,
    ).toBe(1)
    expect(new Set(tabs.map((tab) => tab.id)).size).toBe(2)
  })

  test("selects All events when it is the view", () => {
    const tabs = [
      ...parse(
        renderSessionsTabs(loadedState("events"), { eventsCount: 42 }),
      ).querySelectorAll('[role="tab"]'),
    ]

    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
    ])
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["-1", "0"])
  })

  test("counts the sessions total and the summary's request count", () => {
    const root = parse(
      renderSessionsTabs(
        loadedState("sessions", sessionsPageOf({ total: 1234 })),
        { eventsCount: 56789 },
      ),
    )
    const tabs = [...root.querySelectorAll('[role="tab"]')]

    expect(
      tabs.map((tab) => tab.textContent.replaceAll(/\s+/g, " ").trim()),
    ).toEqual(["Sessions 1,234", "All events 56,789"])
  })

  test("leaves a count blank until its data has loaded", () => {
    const root = parse(
      renderSessionsTabs(createSessionsState("sessions"), {
        eventsCount: null,
      }),
    )
    const tabs = [...root.querySelectorAll('[role="tab"]')]

    expect(tabs.map((tab) => tab.textContent.trim())).toEqual([
      "Sessions",
      "All events",
    ])
  })
})

describe("renderSessionsMeta", () => {
  const metaText = (state: ReturnType<typeof createSessionsState>) =>
    parse(renderSessionsMeta(state)).querySelector(".panel-meta")?.textContent

  test("reads No sessions loaded. before any load", () => {
    expect(metaText(createSessionsState("sessions"))).toBe(
      "No sessions loaded.",
    )
  })

  test("reads Loading sessions... during a first load", () => {
    const { state } = startSessionsLoad(createSessionsState("sessions"), {
      page: 1,
      reason: "initial",
    })
    expect(metaText(state)).toBe("Loading sessions...")
  })

  test("names the page and the order once a page has loaded", () => {
    const state = loadedState(
      "sessions",
      sessionsPageOf({ page: 2, total: 45, total_pages: 3 }),
    )
    expect(metaText(state)).toBe("Page 2 / 3 · newest activity first")
    expect(
      metaText(startSessionsLoad(state, { page: 3, reason: "page" }).state),
    ).toBe("Page 2 / 3 · newest activity first")
  })

  test("counts an empty period as one page", () => {
    const state = loadedState(
      "sessions",
      sessionsPageOf({ items: [], total: 0, total_pages: 0 }),
    )
    expect(metaText(state)).toBe("Page 1 / 1 · newest activity first")
  })

  test("keeps No sessions loaded. after a failed first load", () => {
    const started = startSessionsLoad(createSessionsState("sessions"), {
      page: 1,
      reason: "initial",
    })
    const failed = applySessionsError(started.state, {
      message: "boom",
      missing: false,
      requestId: started.requests[0].requestId,
    }).state
    expect(metaText(failed)).toBe("No sessions loaded.")
  })
})

describe("renderSessionsPager", () => {
  const pager = (state: ReturnType<typeof createSessionsState>) =>
    [...parse(renderSessionsPager(state)).querySelectorAll("button")].map(
      (button) => ({
        action: button.getAttribute("data-session-action"),
        disabled: button.hasAttribute("disabled"),
        label: button.textContent.trim(),
        pageAction: button.getAttribute("data-page-action"),
        type: button.getAttribute("type"),
      }),
    )

  test("pages with session actions, never the All events page actions", () => {
    const state = loadedState(
      "sessions",
      sessionsPageOf({ page: 2, total: 45, total_pages: 3 }),
    )
    expect(pager(state)).toEqual([
      {
        action: "previous-page",
        disabled: false,
        label: "Previous",
        pageAction: null,
        type: "button",
      },
      {
        action: "next-page",
        disabled: false,
        label: "Next",
        pageAction: null,
        type: "button",
      },
    ])
  })

  test("disables Previous on the first page and Next on the last", () => {
    expect(
      pager(
        loadedState(
          "sessions",
          sessionsPageOf({ page: 1, total: 45, total_pages: 3 }),
        ),
      ).map((button) => button.disabled),
    ).toEqual([true, false])
    expect(
      pager(
        loadedState(
          "sessions",
          sessionsPageOf({ page: 3, total: 45, total_pages: 3 }),
        ),
      ).map((button) => button.disabled),
    ).toEqual([false, true])
  })

  test("disables both with no page loaded, or while the list loads", () => {
    expect(
      pager(createSessionsState("sessions")).map((button) => button.disabled),
    ).toEqual([true, true])

    const state = loadedState(
      "sessions",
      sessionsPageOf({ page: 2, total: 45, total_pages: 3 }),
    )
    const reloading = startSessionsLoad(state, {
      page: 3,
      reason: "page",
    }).state
    expect(pager(reloading).map((button) => button.disabled)).toEqual([
      true,
      true,
    ])
  })
})

describe("renderSessionCard", () => {
  const text = (root: ReturnType<typeof parse>, selector: string) =>
    root.querySelector(selector)?.textContent.replaceAll(/\s+/g, " ").trim()

  test("is an article whose whole header is one button controlling a hidden region", () => {
    const root = parse(renderSessionCard(sessionOf(), { index: 3, nowMs: NOW }))
    const article = root.querySelector("article")
    const buttons = article?.querySelectorAll("button")
    const header = buttons?.[0]
    const region = root.querySelector("#session-panel-3")

    expect(article?.dataset.expanded).toBe("false")
    expect(buttons).toHaveLength(1)
    expect(header?.parentElement).toBe(article)
    expect(header?.getAttribute("type")).toBe("button")
    expect(header?.getAttribute("aria-expanded")).toBe("false")
    expect(header?.getAttribute("aria-controls")).toBe("session-panel-3")
    expect(region?.parentElement).toBe(article)
    expect(region?.hasAttribute("hidden")).toBe(true)
    expect(region?.innerHTML).toBe("")
  })

  test("holds only phrasing content in the header", () => {
    const root = parse(renderSessionCard(sessionOf(), { index: 0, nowMs: NOW }))
    const tags = new Set(
      [...root.querySelectorAll("button *")].map((node) => node.tagName),
    )

    expect([...tags]).toEqual(["SPAN"])
  })

  test("carries the session's identity for later toggling", () => {
    const header = parse(
      renderSessionCard(sessionOf({ key: "k1", sessionless: true }), {
        index: 0,
        nowMs: NOW,
      }),
    ).querySelector("button")

    expect(header?.dataset.sessionAction).toBe("toggle")
    expect(header?.dataset.sessionKey).toBe("k1")
    expect(header?.dataset.sessionSessionless).toBe("true")
  })

  test("shows when the session was last active", () => {
    const session = sessionOf()
    const root = parse(renderSessionCard(session, { index: 0, nowMs: NOW }))
    const clock = root.querySelector(".session-clock")

    expect(clock?.textContent).toBe("9:41 PM")
    expect(clock?.getAttribute("title")).toBe(
      new Date(session.last_ms).toLocaleString(),
    )
    expect(text(root, ".session-age")).toBe("1h ago")
    expect(text(root, ".session-day")).toBe("Sep 29 · 4h 12m")
    expect(text(root, ".session-key")).toBe("1a2b3c4d")
    expect(text(root, ".session-active")).toBe(
      "Active Sep 29 5:29 PM → 9:41 PM",
    )
  })

  test("marks a sessionless key as a trace", () => {
    const root = parse(
      renderSessionCard(sessionOf({ key: "9f8e7d6c5b4a", sessionless: true }), {
        index: 0,
        nowMs: NOW,
      }),
    )
    expect(text(root, ".session-key")).toBe("trace 9f8e7d6c")
  })

  test("shows tokens, requests and cost", () => {
    const root = parse(renderSessionCard(sessionOf(), { index: 0, nowMs: NOW }))

    expect(text(root, ".session-tokens")).toBe("4.8M tokens")
    expect(text(root, ".session-requests")).toBe("12 requests")
    expect(text(root, ".session-cost")).toBe("$1.20 cost")
    expect(
      root.querySelector(".session-chevron")?.getAttribute("aria-hidden"),
    ).toBe("true")
  })

  test("uses the singular for one request and the Sessions cost format", () => {
    const root = parse(
      renderSessionCard(
        sessionOf({
          costs: [
            { amount: 0.0042, currency: "usd", total_cost_nanos: 4_200_000 },
          ],
          request_count: 1,
        }),
        { index: 0, nowMs: NOW },
      ),
    )

    expect(text(root, ".session-requests")).toBe("1 request")
    expect(
      root.querySelector(".session-cost .sessions-cost-dim")?.textContent,
    ).toBe("42")
  })

  test("escapes a hostile key", () => {
    const root = parse(
      renderSessionCard(sessionOf({ key: '"><img src=x onerror=alert(1)>' }), {
        index: 0,
        nowMs: NOW,
      }),
    )

    expect(root.querySelector("img")).toBeNull()
    expect(root.querySelector("button")?.dataset.sessionKey).toBe(
      '"><img src=x onerror=alert(1)>',
    )
  })
})

describe("renderSessionsBody", () => {
  const fakes = {
    eventsBody: '<table data-events="true"></table>',
    nowMs: NOW,
    renderEmptyState: (message: string) =>
      `<p data-empty="true">${escapeHtml(message)}</p>`,
    renderError: (message: string, title?: string) =>
      `<div role="alert" data-title="${escapeHtml(title ?? "")}">${escapeHtml(message)}</div>`,
  }
  const body = (state: ReturnType<typeof createSessionsState>) =>
    parse(renderSessionsBody(state, fakes)).firstElementChild

  function failed(
    state: ReturnType<typeof createSessionsState>,
    reason: "initial" | "page" = "page",
  ) {
    const started = startSessionsLoad(state, { page: 2, reason })
    return applySessionsError(started.state, {
      message: "Gateway timeout",
      missing: false,
      requestId: started.requests[0].requestId,
    }).state
  }

  test("is the tab panel labelled by the selected tab", () => {
    const sessionsTabs = parse(
      renderSessionsTabs(loadedState("sessions"), { eventsCount: 1 }),
    )
    const panel = body(loadedState("sessions"))

    expect(panel?.getAttribute("role")).toBe("tabpanel")
    expect(panel?.id).toBe(
      sessionsTabs.querySelector('[role="tab"]')?.getAttribute("aria-controls")
        ?? "",
    )
    expect(panel?.getAttribute("aria-labelledby")).toBe(
      sessionsTabs.querySelector('[aria-selected="true"]')?.id ?? "",
    )
  })

  test("wraps the All events body when All events is selected", () => {
    const eventsTabs = parse(
      renderSessionsTabs(loadedState("events"), { eventsCount: 1 }),
    )
    const panel = body(loadedState("events"))

    expect(panel?.getAttribute("aria-labelledby")).toBe(
      eventsTabs.querySelector('[aria-selected="true"]')?.id ?? "",
    )
    expect(panel?.querySelector('[data-events="true"]')).not.toBeNull()
    expect(panel?.querySelector("article")).toBeNull()
  })

  test("reads No sessions loaded. before any load", () => {
    expect(body(createSessionsState("sessions"))?.textContent.trim()).toBe(
      "No sessions loaded.",
    )
  })

  test("reads Loading sessions... during a first load", () => {
    const { state } = startSessionsLoad(createSessionsState("sessions"), {
      page: 1,
      reason: "initial",
    })
    expect(body(state)?.textContent.trim()).toBe("Loading sessions...")
  })

  test("lists one card per session, newest first as served", () => {
    const page = sessionsPageOf({
      items: [sessionOf({ key: "newer" }), sessionOf({ key: "older" })],
      total: 2,
    })
    const panel = body(loadedState("sessions", page))
    const list = panel?.querySelector(".sessions-list")

    expect(list?.getAttribute("data-loading")).toBe("false")
    expect(
      [...(list?.querySelectorAll("article button") ?? [])].map((button) => [
        button.getAttribute("data-session-key"),
        button.getAttribute("aria-controls"),
      ]),
    ).toEqual([
      ["newer", "session-panel-0"],
      ["older", "session-panel-1"],
    ])
  })

  test("dims the loaded list while it reloads", () => {
    const state = startSessionsLoad(loadedState("sessions"), {
      page: 1,
      reason: "refresh",
    }).state
    const list = body(state)?.querySelector(".sessions-list")

    expect(list?.getAttribute("data-loading")).toBe("true")
    expect(list?.querySelectorAll("article")).toHaveLength(1)
  })

  test("shows the empty state for an empty period", () => {
    const panel = body(
      loadedState(
        "sessions",
        sessionsPageOf({ items: [], total: 0, total_pages: 0 }),
      ),
    )

    expect(panel?.querySelector('[data-empty="true"]')?.textContent).toBe(
      "No sessions for the selected period.",
    )
    expect(panel?.querySelector("article")).toBeNull()
  })

  test("shows a list error alone when no list has loaded", () => {
    const panel = body(failed(createSessionsState("sessions"), "initial"))
    const alert = panel?.querySelector('[role="alert"]')

    expect(alert?.textContent).toBe("Gateway timeout")
    expect(alert?.getAttribute("data-title")).toBe("Sessions failed")
    expect(alert?.parentElement?.className).toBe("p-4")
    expect(panel?.querySelector('[data-empty="true"]')).toBeNull()
  })

  test("shows a list error above the list that is still loaded", () => {
    const panel = body(failed(loadedState("sessions")))
    const children = [...(panel?.children ?? [])]

    expect(children).toHaveLength(2)
    expect(children[0].querySelector('[role="alert"]')).not.toBeNull()
    expect(children[1].className).toBe("sessions-list")
    expect(children[1].getAttribute("data-loading")).toBe("false")
  })
})

describe("missing endpoint fallback", () => {
  test("hides the tablist once the endpoint is missing", () => {
    const started = startSessionsLoad(createSessionsState("sessions"), {
      page: 1,
      reason: "initial",
    })
    const missing = applySessionsError(started.state, {
      message: "Not Found",
      missing: true,
      requestId: started.requests[0].requestId,
    }).state

    expect(renderSessionsTabs(missing, { eventsCount: 3 })).toBe("")
  })
})
