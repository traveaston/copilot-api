import { afterAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

import type {
  TokenUsageSession,
  TokenUsageSessionEventRecord,
  TokenUsageSessionEventsPage,
  TokenUsageSessionsPage,
} from "~/lib/token-usage"

import {
  CURRENCY_SYMBOLS,
  LONG_GAP_MS,
  SESSION_EVENTS_LIMIT,
  SESSIONS_PAGE_SIZE,
  applySessionEvents,
  applySessionEventsError,
  applySessionsError,
  applySessionsPage,
  buildSessionEventsUrl,
  buildSessionsUrl,
  createSessionsState,
  creatorColor,
  escapeHtml,
  formatActiveRange,
  formatAge,
  formatClock,
  formatCompact,
  formatCostAmount,
  formatCostList,
  formatDayLabel,
  formatDuration,
  formatGap,
  formatInteger,
  formatShortKey,
  identityOf,
  isLongGap,
  isSameDay,
  modelCreator,
  formatPercent,
  spanGeometry,
  pluralize,
  readViewParam,
  renderEventRows,
  renderEventsFooter,
  renderSessionCard,
  renderSessionExpansion,
  renderSessionsBody,
  renderSessionsMeta,
  renderSessionsPager,
  renderSessionsTabs,
  renderBreakdownRows,
  retryEvents,
  setView,
  showMoreEvents,
  startSessionsLoad,
  toggleModelFilter,
  toggleSession,
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

describe("modelCreator", () => {
  const cases: Array<[string, string]> = [
    ["gpt-6-sol", "openai"],
    ["gpt-5.3-codex", "openai"],
    ["codex-mini", "openai"],
    ["o4-mini", "openai"],
    ["o3", "openai"],
    ["claude-sonnet-5.5", "anthropic"],
    ["gemini-3.8-flash", "google"],
    ["grok-4.7", "xai"],
    ["mai-code-1.1-flash", "microsoft-ai"],
    ["kimi-k3", "kimi"],
    ["oswe-vscode-prime", "other"],
    ["auto", "other"],
    ["deepseek-v4", "other"],
    ["glm-5", "other"],
    ["qwen3-coder", "other"],
  ]

  for (const [model, creator] of cases) {
    test(`${model} is ${creator}`, () => {
      expect(modelCreator(model)).toBe(creator)
    })
  }

  test("matches the segment after the last slash", () => {
    expect(modelCreator("kimi/kimi-k3")).toBe("kimi")
    expect(modelCreator("a/b/claude-opus-5")).toBe("anthropic")
  })

  test("is case-insensitive", () => {
    expect(modelCreator("Claude-Sonnet-5.5")).toBe("anthropic")
    expect(modelCreator("GPT-6")).toBe("openai")
  })

  test("the o-series rule needs digits then a hyphen or the end", () => {
    expect(modelCreator("o4-mini")).toBe("openai")
    expect(modelCreator("o3")).toBe("openai")
    expect(modelCreator("opus-x")).toBe("other")
    expect(modelCreator("o3x")).toBe("other")
    expect(modelCreator("o")).toBe("other")
  })

  test("creatorColor is the creator's role token", () => {
    expect(creatorColor("claude-sonnet-5.5")).toBe(
      "var(--color-creator-anthropic)",
    )
    expect(creatorColor("mystery")).toBe("var(--color-creator-other)")
  })
})

describe("formatPercent", () => {
  test("shows 0% when the whole is not positive", () => {
    expect(formatPercent(5, 0)).toBe("0%")
    expect(formatPercent(5, -1)).toBe("0%")
  })

  test("shows <1% for a positive share below one percent", () => {
    expect(formatPercent(1, 1000)).toBe("<1%")
  })

  test("rounds otherwise", () => {
    expect(formatPercent(37, 100)).toBe("37%")
    expect(formatPercent(1, 3)).toBe("33%")
    expect(formatPercent(1, 100)).toBe("1%")
    expect(formatPercent(0, 100)).toBe("0%")
  })
})

describe("spanGeometry", () => {
  const range = { end_ms: 2000, start_ms: 1000 }

  test("places the span within the period", () => {
    expect(spanGeometry(1250, 1750, range)).toEqual({ left: 0.25, width: 0.5 })
  })

  test("clamps left into [0, 1] and width into the remaining space", () => {
    expect(spanGeometry(500, 1500, range)).toEqual({ left: 0, width: 1 })
    const nearEnd = spanGeometry(1800, 2500, range)
    expect(nearEnd?.left).toBe(0.8)
    expect(nearEnd?.width).toBeCloseTo(0.2, 10)
    expect(spanGeometry(2500, 3000, range)).toEqual({ left: 1, width: 0 })
  })

  test("a zero-width span stays renderable", () => {
    expect(spanGeometry(1500, 1500, range)).toEqual({ left: 0.5, width: 0 })
  })

  test("an inverted session clamps its width to zero", () => {
    const inverted = spanGeometry(1600, 1200, range)
    expect(inverted?.left).toBeCloseTo(0.6, 10)
    expect(inverted?.width).toBe(0)
  })

  test("has no span without a usable range", () => {
    expect(spanGeometry(1, 2, undefined)).toBeNull()
    expect(spanGeometry(1, 2, null)).toBeNull()
    expect(spanGeometry(1, 2, { end_ms: Number.NaN, start_ms: 0 })).toBeNull()
    expect(
      spanGeometry(1, 2, { end_ms: 10, start_ms: Number.POSITIVE_INFINITY }),
    ).toBeNull()
    expect(spanGeometry(1, 2, { end_ms: 1000, start_ms: 1000 })).toBeNull()
    expect(spanGeometry(1, 2, { end_ms: 500, start_ms: 1000 })).toBeNull()
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

describe("renderSessionCard marks", () => {
  const range = { end_ms: at(2026, 9, 30), start_ms: at(2026, 9, 29) }
  const card = (session = sessionOf(), r: typeof range | null = range) =>
    parse(renderSessionCard(session, { index: 0, nowMs: NOW, range: r }))
  const model = (name: string, tokens: number, requests = 1) => ({
    ...sessionOf(),
    first_ms: 0,
    last_ms: 0,
    model: name,
    request_count: requests,
    total_tokens: tokens,
  })
  const styleValue = (
    el: { getAttribute(name: string): string | null } | null | undefined,
    prop: string,
  ) =>
    Number.parseFloat(
      new RegExp(`${prop}:([\\d.]+)%`).exec(
        el?.getAttribute("style") ?? "",
      )?.[1] ?? "NaN",
    )
  const widths = (
    el: {
      querySelectorAll(selector: string): Iterable<{
        getAttribute(name: string): string | null
      }>
    } | null,
  ) =>
    [...(el?.querySelectorAll("[data-bar-segment]") ?? [])].map((s) =>
      styleValue(s, "width"),
    )

  test("the span track places the session within the period", () => {
    const root = card(
      sessionOf({ first_ms: at(2026, 9, 29, 6), last_ms: at(2026, 9, 29, 18) }),
    )
    const span = root.querySelector(".session-span")
    expect(root.querySelector(".session-track")).not.toBeNull()
    expect(styleValue(span, "left")).toBeCloseTo(25, 3)
    expect(styleValue(span, "width")).toBeCloseTo(50, 3)
  })

  test("the span track renders without a span when range is missing", () => {
    const root = card(sessionOf(), null)
    expect(root.querySelector(".session-track")).not.toBeNull()
    expect(root.querySelector(".session-span")).toBeNull()
  })

  test("the model share bar has a segment per model in API order", () => {
    const root = card(
      sessionOf({
        byModel: [
          model("gpt-6-sol", 3000),
          model("claude-sonnet-5.5", 1000, 7),
        ],
        total_tokens: 4000,
      }),
    )
    const bar = root.querySelector(".session-model-bar")
    const segments = [...(bar?.querySelectorAll("[data-bar-segment]") ?? [])]
    expect(widths(bar)).toEqual([75, 25])
    expect(segments[0]?.getAttribute("title")).toBe("gpt-6-sol 75% of tokens")
    expect(segments[1]?.getAttribute("title")).toBe(
      "claude-sonnet-5.5 25% of tokens",
    )
    expect(segments[0]?.getAttribute("style")).toContain(
      "var(--color-creator-openai)",
    )
    expect(segments[1]?.getAttribute("style")).toContain(
      "var(--color-creator-anthropic)",
    )
  })

  test("the model legend shows dot, name and a bold request count, in ink", () => {
    const root = card(
      sessionOf({ byModel: [model("claude-sonnet-5.5", 1000, 7)] }),
    )
    const item = root.querySelector(".session-model-legend .legend-item")
    expect(item?.querySelector(".legend-dot")?.getAttribute("style")).toContain(
      "var(--color-creator-anthropic)",
    )
    expect(item?.querySelector(".legend-name")?.textContent).toBe(
      "claude-sonnet-5.5",
    )
    expect(item?.querySelector("b")?.textContent).toBe("7")
    expect(item?.getAttribute("style")).toBeNull()
    expect(
      item?.querySelector(".legend-name")?.getAttribute("style"),
    ).toBeNull()
  })

  test("a model with a tiny share shows <1% and a hostile name is escaped", () => {
    const root = card(
      sessionOf({
        byModel: [model("<img src=x>", 1), model("big", 9999)],
        total_tokens: 10_000,
      }),
    )
    expect(root.querySelector("img")).toBeNull()
    expect(
      root.querySelector("[data-bar-segment]")?.getAttribute("title"),
    ).toBe("<img src=x> <1% of tokens")
  })

  test("a session with no models has no model bar or legend", () => {
    const root = card(sessionOf({ byModel: [] }))
    expect(root.querySelector(".session-model-bar")).toBeNull()
    expect(root.querySelector(".session-model-legend")).toBeNull()
  })

  test("token bar widths fill 100% when total_tokens exceeds the parts", () => {
    const root = card(
      sessionOf({
        cache_creation_input_tokens: 120,
        cache_read_input_tokens: 340,
        input_tokens: 120,
        output_tokens: 20,
        total_tokens: 1000,
      }),
    )
    const bar = root.querySelector(".session-token-bar")
    const w = widths(bar)
    expect(w).toHaveLength(4)
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2)
    expect(w[0]).toBeCloseTo((120 / 600) * 100, 2)
    expect(
      [...(bar?.querySelectorAll("[data-bar-segment]") ?? [])].map((s) =>
        s.getAttribute("title"),
      ),
    ).toEqual(["Input 120", "Output 20", "Cache read 340", "Cache write 120"])
    expect(bar?.innerHTML).toContain("var(--color-series-cache-write)")
  })

  test("a session with no token parts has an empty token bar", () => {
    const root = card(
      sessionOf({
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
      }),
    )
    expect(widths(root.querySelector(".session-token-bar"))).toEqual([
      0, 0, 0, 0,
    ])
  })

  test("the token legend is its own row, with compact figures", () => {
    const root = card()
    const legend = root.querySelector(".session-token-legend")
    expect(
      [...(legend?.querySelectorAll(".legend-item") ?? [])].map((i) =>
        i.textContent.replaceAll(/\s+/g, " ").trim(),
      ),
    ).toEqual(["In 1.2M", "Out 85K", "Cache R 3.4M", "Cache W 120K"])
    expect(legend?.querySelectorAll(".legend-dot")).toHaveLength(4)
    expect(legend?.closest(".session-model-legend")).toBeNull()
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

    expect(text(root, ".session-tokens-total")).toBe("4.8M tokens")
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

describe("session events URL", () => {
  const base = "http://localhost:4141/token-usage"

  test("sends session_id for a session and omits null model and before", () => {
    const url = new URL(
      buildSessionEventsUrl(base, {
        before: null,
        key: "abc",
        limit: 50,
        model: null,
        period: "last_7_days",
        sessionless: false,
      }),
    )

    expect(url.pathname).toBe("/token-usage/session-events")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "50",
      period: "last_7_days",
      session_id: "abc",
    })
  })

  test("sends trace_id when sessionless, with model and cursor", () => {
    const url = new URL(
      buildSessionEventsUrl(`${base}/?x=1`, {
        before: "1700:9",
        key: "tr 1",
        limit: 50,
        model: "gpt-5",
        period: "today",
        sessionless: true,
      }),
    )

    expect(Object.fromEntries(url.searchParams)).toEqual({
      before: "1700:9",
      limit: "50",
      model: "gpt-5",
      period: "today",
      trace_id: "tr 1",
    })
  })
})

describe("gap formatters", () => {
  test("formatGap follows the spec examples and floor boundaries", () => {
    expect(formatGap(null)).toBe("—")
    expect(formatGap(0)).toBe("+0s")
    expect(formatGap(42_900)).toBe("+42s")
    expect(formatGap(59_999)).toBe("+59s")
    expect(formatGap(60_000)).toBe("+1m")
    expect(formatGap(185_000)).toBe("+3m 5s")
    expect(formatGap(180_000)).toBe("+3m")
    expect(formatGap(HOUR - 1)).toBe("+59m 59s")
    expect(formatGap(HOUR)).toBe("+1h")
    expect(formatGap(HOUR + 20 * MINUTE)).toBe("+1h 20m")
    expect(formatGap(2 * DAY + 3 * HOUR)).toBe("+2d 3h")
    expect(formatGap(-5)).toBe("+0s")
  })

  test("isLongGap is true from 15 minutes and false for null", () => {
    expect(isLongGap(null)).toBe(false)
    expect(isLongGap(LONG_GAP_MS - 1)).toBe(false)
    expect(isLongGap(LONG_GAP_MS)).toBe(true)
  })
})

function eventOf(
  overrides: Partial<TokenUsageSessionEventRecord> = {},
): TokenUsageSessionEventRecord {
  return {
    cache_creation_input_tokens: 4,
    cache_read_input_tokens: 3,
    cost: null,
    created_at_ms: at(2026, 9, 29, 21, 41, 7),
    created_at_utc: "",
    endpoint: "messages",
    id: 1,
    input_tokens: 1_000,
    model: "claude-opus-4",
    output_tokens: 2,
    prev_ms: null,
    provider_name: null,
    session_id: "s",
    source: "copilot",
    total_nano_aiu: null,
    total_tokens: 1_009,
    trace_id: "trace-1",
    user_id: "u",
    ...overrides,
  } as TokenUsageSessionEventRecord
}

function eventsPageOf(
  overrides: Partial<TokenUsageSessionEventsPage> = {},
): TokenUsageSessionEventsPage {
  return {
    has_more: false,
    items: [eventOf()],
    model: null,
    next_cursor: null,
    period: "today",
    range: sessionsPageOf().range,
    session_id: "1a2b3c4d-5e6f-7a8b",
    total: 1,
    trace_id: null,
    ...overrides,
  }
}

const SESSION = { key: "1a2b3c4d-5e6f-7a8b", sessionless: false }
const SESSION_ID = identityOf(SESSION)

function expandedState() {
  return toggleSession(loadedState("sessions"), SESSION)
}

describe("session expansion transitions", () => {
  test("expanding opens the card at once and requests the newest events", () => {
    const { requests, state } = expandedState()
    const entry = state.expanded[SESSION_ID]

    expect(requests).toEqual([
      {
        before: null,
        identity: SESSION_ID,
        key: SESSION.key,
        kind: "session-events",
        limit: 50,
        mode: "replace",
        model: null,
        requestId: requests[0].requestId,
        sessionless: false,
      },
    ])
    expect(entry.loading).toBe(true)
    expect(entry.items).toEqual([])
    expect(entry.requestId).toBe(requests[0].requestId)
  })

  test("collapsing discards the entry, so re-expanding starts fresh", () => {
    const opened = expandedState().state
    const loaded = applySessionEvents(opened, {
      identity: SESSION_ID,
      page: eventsPageOf(),
      requestId: opened.expanded[SESSION_ID].requestId!,
    }).state

    const closed = toggleSession(loaded, SESSION)
    expect(closed.requests).toEqual([])
    expect(closed.state.expanded).toEqual({})

    const reopened = toggleSession(closed.state, SESSION)
    expect(reopened.state.expanded[SESSION_ID].items).toEqual([])
    expect(reopened.requests).toHaveLength(1)
  })

  test("several sessions open independently and a trace twin is separate", () => {
    let state = loadedState("sessions")
    state = toggleSession(state, SESSION).state
    state = toggleSession(state, { key: SESSION.key, sessionless: true }).state

    expect(Object.keys(state.expanded).toSorted()).toEqual([
      `s:${SESSION.key}`,
      `t:${SESSION.key}`,
    ])
  })

  test("a response fills the entry and a later one is dropped as stale", () => {
    const opened = expandedState()
    const { requestId } = opened.requests[0]
    const applied = applySessionEvents(opened.state, {
      identity: SESSION_ID,
      page: eventsPageOf({ has_more: true, next_cursor: "5:5", total: 120 }),
      requestId,
    })
    const entry = applied.state.expanded[SESSION_ID]

    expect(entry).toMatchObject({
      hasMore: true,
      loading: false,
      nextCursor: "5:5",
      total: 120,
    })
    expect(entry.items).toHaveLength(1)

    const stale = applySessionEvents(applied.state, {
      identity: SESSION_ID,
      page: eventsPageOf({ items: [eventOf({ id: 2 }), eventOf({ id: 3 })] }),
      requestId: requestId + 99,
    })
    expect(stale.state).toBe(applied.state)
  })

  test("a response for a collapsed session is dropped", () => {
    const opened = expandedState()
    const closed = toggleSession(opened.state, SESSION).state

    const result = applySessionEvents(closed, {
      identity: SESSION_ID,
      page: eventsPageOf(),
      requestId: opened.requests[0].requestId,
    })
    expect(result.state).toBe(closed)
    expect(
      applySessionEventsError(closed, {
        identity: SESSION_ID,
        message: "x",
        requestId: opened.requests[0].requestId,
      }).state,
    ).toBe(closed)
  })

  test("collapse and re-expand mid-load never duplicates rows", () => {
    const first = expandedState()
    const closed = toggleSession(first.state, SESSION).state
    const second = toggleSession(closed, SESSION)

    const late = applySessionEvents(second.state, {
      identity: SESSION_ID,
      page: eventsPageOf(),
      requestId: first.requests[0].requestId,
    })
    expect(late.state.expanded[SESSION_ID].items).toEqual([])

    const fresh = applySessionEvents(late.state, {
      identity: SESSION_ID,
      page: eventsPageOf(),
      requestId: second.requests[0].requestId,
    })
    expect(fresh.state.expanded[SESSION_ID].items).toHaveLength(1)
  })

  test("Show more appends by cursor and keeps the rows loaded", () => {
    const opened = expandedState()
    const loaded = applySessionEvents(opened.state, {
      identity: SESSION_ID,
      page: eventsPageOf({ has_more: true, next_cursor: "5:5", total: 2 }),
      requestId: opened.requests[0].requestId,
    }).state

    const more = showMoreEvents(loaded, SESSION_ID)
    expect(more.requests[0]).toMatchObject({ before: "5:5", mode: "append" })
    expect(more.state.expanded[SESSION_ID].loading).toBe(true)
    expect(more.state.expanded[SESSION_ID].items).toHaveLength(1)

    const done = applySessionEvents(more.state, {
      identity: SESSION_ID,
      page: eventsPageOf({ items: [eventOf({ id: 2 })], total: 2 }),
      requestId: more.requests[0].requestId,
    }).state.expanded[SESSION_ID]
    expect(done.items.map((item) => item.id)).toEqual([1, 2])
    expect(done.hasMore).toBe(false)
  })

  test("Show more does nothing while loading, at the end or when collapsed", () => {
    const opened = expandedState()
    expect(showMoreEvents(opened.state, SESSION_ID).requests).toEqual([])

    const loaded = applySessionEvents(opened.state, {
      identity: SESSION_ID,
      page: eventsPageOf(),
      requestId: opened.requests[0].requestId,
    }).state
    expect(showMoreEvents(loaded, SESSION_ID).requests).toEqual([])
    expect(showMoreEvents(loaded, "s:other").requests).toEqual([])
  })

  test("an error keeps the rows and Retry repeats the same request", () => {
    const opened = expandedState()
    const loaded = applySessionEvents(opened.state, {
      identity: SESSION_ID,
      page: eventsPageOf({ has_more: true, next_cursor: "5:5", total: 2 }),
      requestId: opened.requests[0].requestId,
    }).state
    const more = showMoreEvents(loaded, SESSION_ID)
    const failed = applySessionEventsError(more.state, {
      identity: SESSION_ID,
      message: "boom",
      requestId: more.requests[0].requestId,
    }).state
    const entry = failed.expanded[SESSION_ID]

    expect(entry.error).toBe("boom")
    expect(entry.loading).toBe(false)
    expect(entry.items).toHaveLength(1)

    const retry = retryEvents(failed, SESSION_ID)
    expect(retry.requests[0]).toMatchObject({ before: "5:5", mode: "append" })
    expect(retry.requests[0].requestId).toBeGreaterThan(
      more.requests[0].requestId,
    )
    expect(retry.state.expanded[SESSION_ID]).toMatchObject({
      error: null,
      loading: true,
    })
  })

  test("a failed first load retries as a replace; Retry without an error is a no-op", () => {
    const opened = expandedState()
    const failed = applySessionEventsError(opened.state, {
      identity: SESSION_ID,
      message: "down",
      requestId: opened.requests[0].requestId,
    }).state

    expect(retryEvents(failed, SESSION_ID).requests[0]).toMatchObject({
      before: null,
      mode: "replace",
    })
    expect(retryEvents(opened.state, SESSION_ID).requests).toEqual([])
    expect(retryEvents(failed, "s:none").requests).toEqual([])
  })

  test("a stale error response is dropped", () => {
    const opened = expandedState()
    const result = applySessionEventsError(opened.state, {
      identity: SESSION_ID,
      message: "late",
      requestId: opened.requests[0].requestId + 5,
    })
    expect(result.state).toBe(opened.state)
  })

  test("paging the sessions list collapses every open session", () => {
    const opened = expandedState().state
    const paged = startSessionsLoad(opened, { page: 2, reason: "page" })
    const landed = applySessionsPage(paged.state, {
      page: sessionsPageOf({ page: 2, total: 40, total_pages: 2 }),
      requestId: paged.requests[0].requestId,
    })
    expect(landed.state.expanded).toEqual({})

    const refreshed = startSessionsLoad(opened, { page: 1, reason: "refresh" })
    const kept = applySessionsPage(refreshed.state, {
      page: sessionsPageOf(),
      requestId: refreshed.requests[0].requestId,
    })
    expect(Object.keys(kept.state.expanded)).toEqual([SESSION_ID])
  })
})

describe("renderEventsFooter", () => {
  const base = expandedState().state.expanded[SESSION_ID]
  const footer = (overrides: Partial<typeof base>) =>
    parse(renderEventsFooter({ ...base, ...overrides }))

  test("loading", () => {
    expect(footer({}).textContent).toBe("Loading events...")
  })

  test("error shows an alert and a Retry button that names the session", () => {
    const root = footer({ error: "boom <b>", loading: false })
    const alert = root.querySelector('[role="alert"]')
    const retry = root.querySelector('button[data-session-action="retry"]')

    expect(alert?.textContent).toBe("boom <b>")
    expect(root.querySelector("b")).toBeNull()
    expect(retry?.textContent).toBe("Retry")
    expect(retry?.getAttribute("type")).toBe("button")
    expect(retry?.getAttribute("data-session-key")).toBe(SESSION.key)
    expect(retry?.getAttribute("data-session-sessionless")).toBe("false")
  })

  test("an empty period", () => {
    expect(footer({ loading: false }).textContent).toBe(
      "No events in this period.",
    )
  })

  test("Show N more caps at 50 and Showing X of Y", () => {
    const root = footer({
      hasMore: true,
      items: [eventOf(), eventOf()],
      loading: false,
      total: 200,
    })
    expect(
      root.querySelector('[data-session-action="more"]')?.textContent,
    ).toBe("Show 50 more")
    expect(root.textContent).toContain("Showing 2 of 200 events")
  })

  test("Show N more is the remainder when under 50, and singular event", () => {
    const some = footer({
      hasMore: true,
      items: [eventOf()],
      loading: false,
      total: 11,
    })
    expect(
      some.querySelector('[data-session-action="more"]')?.textContent,
    ).toBe("Show 10 more")

    const one = footer({ items: [eventOf()], loading: false, total: 1 })
    expect(one.querySelector("button")).toBeNull()
    expect(one.textContent).toBe("Showing 1 of 1 event")
  })
})

describe("renderEventRows", () => {
  const options = { multiDay: false, nowMs: NOW }

  test("single-model sub-header and one row per event", () => {
    const root = parse(
      `<table>${renderEventRows(
        [
          eventOf({ prev_ms: null }),
          eventOf({
            created_at_ms: at(2026, 9, 29, 22, 0, 7),
            id: 2,
            prev_ms: at(2026, 9, 29, 21, 41, 7),
          }),
        ],
        options,
      )}</table>`,
    )
    const heads = [...root.querySelectorAll("th")].map((th) => th.textContent)
    const rows = [...root.querySelectorAll("tr.session-event-row")]

    expect(heads).toEqual([
      "Model",
      "Time",
      "Gap",
      "Input",
      "Output",
      "Cache Read",
      "Cache Write",
      "Total",
      "Cost",
      "Trace",
    ])
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.children.length === 10)).toBe(true)
    expect(rows[0].children[1].textContent).toBe("9:41:07 PM")
    expect(rows[0].children[2].textContent).toBe("—")
    expect(rows[1].children[2].textContent).toBe("+19m")
    expect(rows[1].children[2].className).toContain("session-gap-long")
    expect(rows[0].children[2].className).not.toContain("session-gap-long")
  })

  test("cells show the four token fields, total, cost and an escaped trace button", () => {
    const root = parse(
      `<table>${renderEventRows(
        [
          eventOf({
            cost: {
              amount: 1.2,
              currency: "USD",
              source: "x",
              total_cost_nanos: 1,
            },
            input_tokens: 1234,
            model: "<m>",
            trace_id: "t<1>",
          }),
          eventOf({ id: 2 }),
        ],
        options,
      )}</table>`,
    )
    const [first, second] = [...root.querySelectorAll("tr.session-event-row")]
    const cells = [...first.children].map((cell) => cell.textContent)

    expect(cells[0]).toBe("<m>")
    expect(cells.slice(3, 9)).toEqual([
      "1,234",
      "2",
      "3",
      "4",
      "1,009",
      "$1.20",
    ])
    expect(second.children[8].textContent).toBe("—")
    const trace = first.querySelector("button")
    expect(trace?.getAttribute("type")).toBe("button")
    expect(trace?.getAttribute("title")).toBe("Copy trace id")
    expect(trace?.textContent).toBe("t<1>")
  })

  test("the model dot takes the model's creator colour", () => {
    const root = parse(
      `<table>${renderEventRows([eventOf({ model: "claude-opus-4" }), eventOf({ id: 2, model: "gpt-5" })], options)}</table>`,
    )
    const dots = [...root.querySelectorAll(".session-dot")].map((dot) =>
      dot.getAttribute("style"),
    )

    expect(dots).toEqual([
      `background:${creatorColor("claude-opus-4")}`,
      `background:${creatorColor("gpt-5")}`,
    ])
    expect(dots[0]).not.toBe(dots[1])
  })

  test("no day dividers in a single-day session", () => {
    const html = renderEventRows([eventOf()], options)
    expect(html).not.toContain("session-day-row")
  })

  test("multi-day sessions get a divider before the first row and each date change", () => {
    const root = parse(
      `<table>${renderEventRows(
        [
          eventOf({ created_at_ms: at(2026, 9, 29, 1, 0), id: 3 }),
          eventOf({ created_at_ms: at(2026, 9, 29, 0, 30), id: 2 }),
          eventOf({ created_at_ms: at(2026, 9, 28, 23, 0), id: 1 }),
        ],
        { multiDay: true, nowMs: NOW },
      )}</table>`,
    )
    const rows = [...root.querySelectorAll("tbody > tr")].map(
      (row) => row.className,
    )
    const dividers = [...root.querySelectorAll("tr.session-day-row")]

    expect(rows).toEqual([
      "session-events-subheader",
      "session-day-row",
      "session-event-row",
      "session-event-row",
      "session-day-row",
      "session-event-row",
    ])
    expect(dividers.map((row) => row.textContent)).toEqual(["Sep 29", "Sep 28"])
    const cell = dividers[0].querySelector("td")
    expect(cell?.getAttribute("colspan")).toBe("10")
    expect(cell?.querySelector("span.session-day-label")?.textContent).toBe(
      "Sep 29",
    )
  })
})

describe("renderSessionExpansion and the expanded card", () => {
  const session = sessionOf({ endpoints: ["messages", "responses"] })

  function loadedEntry(items = [eventOf()], total = items.length) {
    const opened = toggleSession(loadedState("sessions"), session)
    return applySessionEvents(opened.state, {
      identity: identityOf(session),
      page: eventsPageOf({ items, total }),
      requestId: opened.requests[0].requestId,
    }).state.expanded[identityOf(session)]
  }

  test("head line: label, full key in code and endpoints", () => {
    const root = parse(
      renderSessionExpansion(session, loadedEntry(), { nowMs: NOW }),
    )

    expect(root.querySelector(".session-head")?.textContent).toContain(
      "Session ",
    )
    expect(root.querySelector("code")?.textContent).toBe(session.key)
    expect(root.querySelector(".session-head-endpoints")?.textContent).toBe(
      "messages, responses",
    )
    expect(root.querySelectorAll("table")).toHaveLength(1)
  })

  test("sessionless head line says so", () => {
    const sessionless = sessionOf({ sessionless: true })
    const opened = toggleSession(loadedState("sessions"), sessionless)
    const root = parse(
      renderSessionExpansion(
        sessionless,
        opened.state.expanded[identityOf(sessionless)],
        { nowMs: NOW },
      ),
    )
    expect(root.querySelector(".session-head")?.textContent).toContain(
      "No session id · trace",
    )
  })

  test("no table while there are no rows, only the loading footer", () => {
    const opened = toggleSession(loadedState("sessions"), session)
    const root = parse(
      renderSessionExpansion(
        session,
        opened.state.expanded[identityOf(session)],
        { nowMs: NOW },
      ),
    )
    expect(root.querySelector("table")).toBeNull()
    expect(root.textContent).toContain("Loading events...")
  })

  test("a session spanning two dates renders day dividers", () => {
    const multi = sessionOf({
      first_ms: at(2026, 9, 28, 23, 0),
      last_ms: at(2026, 9, 29, 1, 0),
    })
    const opened = toggleSession(loadedState("sessions"), multi)
    const entry = applySessionEvents(opened.state, {
      identity: identityOf(multi),
      page: eventsPageOf(),
      requestId: opened.requests[0].requestId,
    }).state.expanded[identityOf(multi)]

    expect(
      parse(
        renderSessionExpansion(multi, entry, { nowMs: NOW }),
      ).querySelectorAll(".session-day-row"),
    ).toHaveLength(1)
  })

  test("the card is collapsed and hidden without an entry, open with one", () => {
    const closed = parse(renderSessionCard(session, { index: 0, nowMs: NOW }))
    expect(closed.querySelector("article")?.getAttribute("data-expanded")).toBe(
      "false",
    )
    expect(
      closed.querySelector("#session-panel-0")?.hasAttribute("hidden"),
    ).toBe(true)
    expect(closed.querySelector("#session-panel-0")?.innerHTML).toBe("")

    const open = parse(
      renderSessionCard(session, {
        expansion: loadedEntry(),
        index: 0,
        nowMs: NOW,
      }),
    )
    const header = open.querySelector(".session-card-header")
    const region = open.querySelector("#session-panel-0")

    expect(open.querySelector("article")?.getAttribute("data-expanded")).toBe(
      "true",
    )
    expect(header?.getAttribute("aria-expanded")).toBe("true")
    expect(region?.hasAttribute("hidden")).toBe(false)
    expect(region?.querySelector("table")).not.toBeNull()
  })

  test("the sessions body expands only the open session's card", () => {
    const state = toggleSession(loadedState("sessions"), session).state
    const root = parse(
      renderSessionsBody(state, {
        eventsBody: "",
        nowMs: NOW,
        renderEmptyState: (message) => `<p>${message}</p>`,
        renderError: (message) => `<p>${message}</p>`,
      }),
    )
    expect(root.querySelector("article")?.getAttribute("data-expanded")).toBe(
      "true",
    )
    expect(root.textContent).toContain("Loading events...")
  })
})

// --- Model breakdown and filter (ticket 16) ---

const MODEL_A = "claude-opus-4"
const MODEL_B = "gpt-5"

function modelEntryOf(
  model: string,
  overrides: Partial<TokenUsageSession["byModel"][number]> = {},
): TokenUsageSession["byModel"][number] {
  return {
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    costs: [{ amount: 1, currency: "USD", total_cost_nanos: 1_000_000_000 }],
    first_ms: at(2026, 9, 29, 17, 29),
    input_tokens: 0,
    last_ms: at(2026, 9, 29, 21, 41),
    model,
    output_tokens: 0,
    request_count: 3,
    total_nano_aiu: null,
    total_tokens: 0,
    ...overrides,
  }
}

const MULTI = sessionOf({
  byModel: [
    modelEntryOf(MODEL_A, {
      cache_read_input_tokens: 600,
      input_tokens: 300,
      output_tokens: 80,
      request_count: 9,
      total_tokens: 1_000,
    }),
    modelEntryOf(MODEL_B, {
      cache_creation_input_tokens: 20,
      input_tokens: 100,
      output_tokens: 100,
      request_count: 1,
      total_tokens: 3_000,
    }),
  ],
  cache_creation_input_tokens: 20,
  cache_read_input_tokens: 600,
  input_tokens: 400,
  output_tokens: 180,
  total_tokens: 4_000,
})
const MULTI_ID = identityOf(MULTI)

function multiEntry(overrides: Record<string, unknown> = {}) {
  const opened = toggleSession(loadedState("sessions"), MULTI)
  const loaded = applySessionEvents(opened.state, {
    identity: MULTI_ID,
    page: eventsPageOf({
      has_more: true,
      items: [eventOf({ id: 1 }), eventOf({ id: 2 })],
      next_cursor: "9:9",
      total: 80,
    }),
    requestId: opened.requests[0].requestId,
  }).state
  return {
    ...loaded,
    expanded: {
      ...loaded.expanded,
      [MULTI_ID]: { ...loaded.expanded[MULTI_ID], ...overrides },
    },
  }
}

describe("toggleModelFilter", () => {
  test("choosing a model clears the rows and requests the newest 50 for it", () => {
    const { requests, state } = toggleModelFilter(
      multiEntry(),
      MULTI_ID,
      MODEL_A,
    )
    const entry = state.expanded[MULTI_ID]

    expect(entry).toMatchObject({
      filter: MODEL_A,
      hasMore: false,
      items: [],
      loading: true,
      nextCursor: null,
      stale: false,
      total: 0,
    })
    expect(requests).toEqual([
      {
        before: null,
        identity: MULTI_ID,
        key: MULTI.key,
        kind: "session-events",
        limit: 50,
        mode: "replace",
        model: MODEL_A,
        requestId: requests[0].requestId,
        sessionless: false,
      },
    ])
    expect(entry.requestId).toBe(requests[0].requestId)
  })

  test("choosing the active model again removes the filter and reloads unfiltered", () => {
    const on = toggleModelFilter(multiEntry(), MULTI_ID, MODEL_A).state
    const off = toggleModelFilter(on, MULTI_ID, MODEL_A)

    expect(off.state.expanded[MULTI_ID].filter).toBeNull()
    expect(off.state.expanded[MULTI_ID].items).toEqual([])
    expect(off.requests[0].model).toBeNull()
  })

  test("null clears the filter, and another model switches it", () => {
    const on = toggleModelFilter(multiEntry(), MULTI_ID, MODEL_A).state
    expect(
      toggleModelFilter(on, MULTI_ID, null).state.expanded[MULTI_ID].filter,
    ).toBeNull()
    expect(toggleModelFilter(on, MULTI_ID, MODEL_B).requests[0].model).toBe(
      MODEL_B,
    )
  })

  test("a response for the previous filter is dropped as stale", () => {
    const first = toggleModelFilter(multiEntry(), MULTI_ID, MODEL_A)
    const second = toggleModelFilter(first.state, MULTI_ID, MODEL_B)
    const late = applySessionEvents(second.state, {
      identity: MULTI_ID,
      page: eventsPageOf(),
      requestId: first.requests[0].requestId,
    })
    expect(late.state).toBe(second.state)
  })

  test("a collapsed session does nothing", () => {
    const state = loadedState("sessions")
    const result = toggleModelFilter(state, MULTI_ID, MODEL_A)
    expect(result.state).toBe(state)
    expect(result.requests).toEqual([])
  })

  test("Show more and Retry keep the filter and cursor", () => {
    const filtered = applySessionEvents(
      toggleModelFilter(multiEntry(), MULTI_ID, MODEL_A).state,
      {
        identity: MULTI_ID,
        page: eventsPageOf({ has_more: true, next_cursor: "7:7", total: 60 }),
        requestId: toggleModelFilter(multiEntry(), MULTI_ID, MODEL_A)
          .requests[0].requestId,
      },
    )
    expect(filtered.state.expanded[MULTI_ID].filter).toBe(MODEL_A)

    const more = showMoreEvents(filtered.state, MULTI_ID)
    expect(more.requests[0]).toMatchObject({
      before: "7:7",
      mode: "append",
      model: MODEL_A,
    })

    const failed = applySessionEventsError(more.state, {
      identity: MULTI_ID,
      message: "boom",
      requestId: more.requests[0].requestId,
    })
    const retried = retryEvents(failed.state, MULTI_ID)
    expect(retried.requests[0]).toMatchObject({
      before: "7:7",
      mode: "append",
      model: MODEL_A,
    })
  })
})

describe("renderBreakdownRows", () => {
  const entry = () => multiEntry().expanded[MULTI_ID]
  const render = (session = MULTI, overrides: Record<string, unknown> = {}) =>
    parse(
      `<table>${renderBreakdownRows(session, { ...entry(), ...overrides }, { nowMs: NOW })}</table>`,
    )

  test("only a session with more than one model has a breakdown", () => {
    expect(renderBreakdownRows(MULTI, entry(), { nowMs: NOW })).not.toBe("")
    for (const byModel of [[], [modelEntryOf(MODEL_A)]]) {
      expect(
        renderBreakdownRows(sessionOf({ byModel }), entry(), { nowMs: NOW }),
      ).toBe("")
    }
  })

  test("header and one row per model in API order", () => {
    const root = render()
    const heads = [...root.querySelectorAll("thead th")].map(
      (th) => th.textContent,
    )
    const rows = [...root.querySelectorAll("tbody tr")]

    expect(heads).toEqual([
      "Model · requests",
      "Active",
      "Input",
      "Output",
      "Cache Read",
      "Cache Write",
      "Total",
      "Cost",
      "Share of tokens",
    ])
    expect(
      root.querySelector("thead th:nth-child(2)")?.getAttribute("colspan"),
    ).toBe("2")
    expect(rows).toHaveLength(2)
    const cells = [...rows[0].querySelectorAll("td")].map(
      (td) => td.textContent,
    )
    expect(cells[0]).toBe(`${MODEL_A}9`)
    expect(cells.slice(2, 8)).toEqual([
      "300",
      "80",
      "600",
      "0",
      "1,000",
      "$1.00",
    ])
    expect(rows[1].querySelector("td")?.textContent).toBe(`${MODEL_B}1`)
  })

  test("the first cell is a button whose aria-pressed follows the filter", () => {
    const off = render()
    const button = off.querySelector("tbody tr td:first-child button")
    expect(button?.getAttribute("type")).toBe("button")
    expect(button?.getAttribute("aria-pressed")).toBe("false")
    expect(button?.getAttribute("data-session-action")).toBe("filter")
    expect(button?.getAttribute("data-model")).toBe(MODEL_A)
    expect(button?.getAttribute("data-session-key")).toBe(MULTI.key)
    expect(button?.getAttribute("data-session-sessionless")).toBe("false")

    const on = render(MULTI, { filter: MODEL_B })
    const pressed = [...on.querySelectorAll("tbody tr")].map((row) =>
      row.querySelector("button")?.getAttribute("aria-pressed"),
    )
    expect(pressed).toEqual(["false", "true"])
  })

  test("a click anywhere on the row toggles, and an active filter dims the others", () => {
    const root = render(MULTI, { filter: MODEL_B })
    const [first, second] = [...root.querySelectorAll("tbody tr")]

    expect(first.getAttribute("data-session-action")).toBe("filter")
    expect(first.getAttribute("data-model")).toBe(MODEL_A)
    expect(first.classList.contains("session-breakdown-dim")).toBe(true)
    expect(first.classList.contains("session-breakdown-pressed")).toBe(false)
    expect(second.classList.contains("session-breakdown-pressed")).toBe(true)
    expect(second.classList.contains("session-breakdown-dim")).toBe(false)
    expect(
      [...render().querySelectorAll("tbody tr")].some((row) =>
        row.classList.contains("session-breakdown-dim"),
      ),
    ).toBe(false)
  })

  test("dots carry the creator colour", () => {
    const dot = render().querySelector("tbody tr .session-dot")
    expect(dot?.getAttribute("style")).toContain(creatorColor(MODEL_A))
  })

  test("the share bar sizes the four parts against the session's sum of parts", () => {
    const row = render().querySelector("tbody tr")!
    const widths = [...row.querySelectorAll("[data-bar-segment]")].map((s) =>
      s.getAttribute("style"),
    )
    // session parts sum to 400 + 180 + 600 + 20 = 1200; model A: 300/80/600/0
    expect(widths).toHaveLength(4)
    expect(widths[0]).toContain("width:25%")
    expect(widths[2]).toContain("width:50%")
    expect(widths[3]).toContain("width:0%")
    expect(row.querySelector(".session-bar")?.className).toContain(
      "session-share-bar",
    )
    expect(row.querySelector("td:last-child")?.textContent).toContain("25%")
    expect(
      render().querySelector("tbody tr:nth-child(2) td:last-child")
        ?.textContent,
    ).toContain("75%")
  })

  test("a session with no token parts gets empty bars", () => {
    const flat = sessionOf({
      byModel: [modelEntryOf(MODEL_A), modelEntryOf(MODEL_B)],
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    })
    const widths = [
      ...render(flat).querySelectorAll(
        "tbody tr:first-child [data-bar-segment]",
      ),
    ].map((s) => s.getAttribute("style"))
    expect(widths.every((w) => w?.includes("width:0%"))).toBe(true)
  })

  test("escapes model names", () => {
    const evil = sessionOf({
      byModel: [modelEntryOf("<i>x</i>"), modelEntryOf(MODEL_B)],
    })
    const root = render(evil)
    expect(root.querySelector("i")).toBeNull()
    expect(root.querySelector("tbody tr td")?.textContent).toContain("<i>x</i>")
  })
})

describe("multi-model expansion", () => {
  const expansion = (overrides: Record<string, unknown> = {}) =>
    parse(
      renderSessionExpansion(MULTI, multiEntry(overrides).expanded[MULTI_ID], {
        nowMs: NOW,
      }),
    )

  test("breakdown sits above an Events sub-header and the rows", () => {
    const root = expansion()
    expect(root.querySelectorAll("table")).toHaveLength(1)
    expect(root.querySelectorAll("tbody.session-breakdown")).toHaveLength(1)
    const heads = [
      ...root.querySelectorAll(".session-events-subheader th"),
    ].map((th) => th.textContent)
    expect(heads).toEqual([
      "Events",
      "Time",
      "Gap",
      "",
      "",
      "",
      "",
      "",
      "",
      "Trace",
    ])
    const order = [...root.querySelectorAll("table > *")].map(
      (el) => el.className || el.tagName,
    )
    expect(order).toEqual(["THEAD", "session-breakdown", "session-events-body"])
  })

  test("the head line gains the filter hint", () => {
    expect(expansion().querySelector(".session-head")?.textContent).toContain(
      " · click a model to filter",
    )
  })

  test("a single-model session has neither breakdown, hint nor Events header", () => {
    const single = sessionOf({ byModel: [modelEntryOf(MODEL_A)] })
    const opened = toggleSession(loadedState("sessions"), single)
    const entry = applySessionEvents(opened.state, {
      identity: identityOf(single),
      page: eventsPageOf(),
      requestId: opened.requests[0].requestId,
    }).state.expanded[identityOf(single)]
    const root = parse(renderSessionExpansion(single, entry, { nowMs: NOW }))

    expect(root.querySelector(".session-breakdown")).toBeNull()
    expect(root.querySelector(".session-head")?.textContent).not.toContain(
      "click a model",
    )
    expect(
      root.querySelector(".session-events-subheader th")?.textContent,
    ).toBe("Model")
  })

  test("the breakdown shows on expand before any rows, then the filter clears rows but keeps it", () => {
    const opened = toggleSession(loadedState("sessions"), MULTI)
    const fresh = parse(
      renderSessionExpansion(MULTI, opened.state.expanded[MULTI_ID], {
        nowMs: NOW,
      }),
    )
    expect(fresh.querySelectorAll(".session-breakdown-row")).toHaveLength(2)
    expect(fresh.querySelector(".session-events-body")).toBeNull()
    expect(fresh.textContent).toContain("Loading events...")

    const filtered = toggleModelFilter(multiEntry(), MULTI_ID, MODEL_B).state
    const root = parse(
      renderSessionExpansion(MULTI, filtered.expanded[MULTI_ID], {
        nowMs: NOW,
      }),
    )
    expect(root.querySelectorAll(".session-breakdown-row")).toHaveLength(2)
    expect(
      root.querySelector("button[aria-pressed=true]")?.textContent,
    ).toContain(MODEL_B)
    expect(root.querySelectorAll(".session-event-row")).toHaveLength(0)
  })

  test("event rows are creator-coloured", () => {
    const dot = expansion().querySelector(".session-event-row .session-dot")
    expect(dot?.getAttribute("style")).toContain(creatorColor(MODEL_A))
  })
})

describe("filter chip in the events footer", () => {
  const base = multiEntry().expanded[MULTI_ID]
  const footer = (overrides: Record<string, unknown>) =>
    parse(renderEventsFooter({ ...base, filter: MODEL_A, ...overrides }))
  const states: Array<[string, Record<string, unknown>, string]> = [
    ["loading", { loading: true }, "Loading events..."],
    ["error", { error: "boom", loading: false }, "boom"],
    [
      "empty",
      { items: [], loading: false, total: 0 },
      "No events in this period.",
    ],
    [
      "loaded",
      { loading: false, total: 2, hasMore: false },
      "Showing 2 of 2 events",
    ],
    ["loaded with more", { loading: false, total: 80 }, "Show 50 more"],
  ]

  for (const [name, overrides, text] of states) {
    test(`${name}: appends only ‹model› and a clear button`, () => {
      const root = footer(overrides)
      const clear = root.querySelector("button[data-session-action=filter]")

      expect(root.textContent).toContain(text)
      expect(root.textContent).toContain(` · only ${MODEL_A} clear`)
      expect(clear?.textContent).toBe("clear")
      expect(clear?.getAttribute("data-model")).toBeNull()
      expect(clear?.getAttribute("data-session-key")).toBe(MULTI.key)
      expect(clear?.getAttribute("data-session-sessionless")).toBe("false")
    })
  }

  test("without a filter there is no chip", () => {
    const root = footer({ filter: null, loading: true })
    expect(root.textContent).not.toContain("only")
    expect(root.querySelector("[data-session-action=filter]")).toBeNull()
  })

  test("the model name is escaped", () => {
    const root = footer({ filter: "<b>x</b>", loading: true })
    expect(root.querySelector("b")).toBeNull()
    expect(root.textContent).toContain("only <b>x</b>")
  })
})

describe("session copy controls", () => {
  const session = sessionOf({ endpoints: ["messages"] })

  function expansionRoot() {
    const opened = toggleSession(loadedState("sessions"), session)
    const entry = applySessionEvents(opened.state, {
      identity: identityOf(session),
      page: eventsPageOf({
        items: [eventOf({ trace_id: "trace-abc" })],
        total: 1,
      }),
      requestId: opened.requests[0].requestId,
    }).state.expanded[identityOf(session)]
    return parse(renderSessionExpansion(session, entry, { nowMs: NOW }))
  }

  test("head line Copy button carries the key attributes", () => {
    const button = expansionRoot().querySelector(
      '.session-head [data-session-action="copy-key"]',
    )
    expect(button?.tagName).toBe("BUTTON")
    expect(button?.getAttribute("type")).toBe("button")
    expect(button?.textContent).toBe("Copy")
    expect(button?.getAttribute("title")).toBe("Copy session key")
    expect(button?.getAttribute("data-session-key")).toBe(session.key)
    expect(button?.getAttribute("data-session-sessionless")).toBe("false")
  })

  test("sessionless head line Copy button flags sessionless", () => {
    const sessionless = sessionOf({ sessionless: true })
    const opened = toggleSession(loadedState("sessions"), sessionless)
    const root = parse(
      renderSessionExpansion(
        sessionless,
        opened.state.expanded[identityOf(sessionless)],
        {
          nowMs: NOW,
        },
      ),
    )
    expect(
      root
        .querySelector('[data-session-action="copy-key"]')
        ?.getAttribute("data-session-sessionless"),
    ).toBe("true")
  })

  test("trace button is a titled button carrying the trace id", () => {
    const button = expansionRoot().querySelector(
      '[data-session-action="copy-trace"]',
    )
    expect(button?.getAttribute("type")).toBe("button")
    expect(button?.getAttribute("title")).toBe("Copy trace id")
    expect(button?.getAttribute("data-trace-id")).toBe("trace-abc")
    expect(button?.textContent).toBe("trace-abc")
  })
})

// --- State survival across Refresh and period change (ticket 18) ---

const OTHER = sessionOf({ key: "9f8e7d6c-other", last_ms: at(2026, 9, 29, 20) })
const OTHER_ID = identityOf(OTHER)

/** A loaded page holding `items`, with `session` open and two pages of its events loaded. */
function survivalState(
  items: TokenUsageSession[] = [MULTI, OTHER],
  session: TokenUsageSession = MULTI,
) {
  const opened = toggleSession(
    loadedState("sessions", sessionsPageOf({ items, total: items.length })),
    session,
  )
  const identity = identityOf(session)
  const first = applySessionEvents(opened.state, {
    identity,
    page: eventsPageOf({
      has_more: true,
      items: [eventOf({ id: 4 }), eventOf({ id: 3 })],
      next_cursor: "3:3",
      total: 4,
    }),
    requestId: opened.requests[0].requestId,
  }).state
  const more = showMoreEvents(first, identity)
  return applySessionEvents(more.state, {
    identity,
    page: eventsPageOf({
      items: [eventOf({ id: 2 }), eventOf({ id: 1 })],
      total: 4,
    }),
    requestId: more.requests[0].requestId,
  }).state
}

/** Runs a full load (or page move) to the point where its list page lands. */
function landLoad(
  state: ReturnType<typeof survivalState>,
  reason: "refresh" | "period" | "page",
  page: TokenUsageSessionsPage,
) {
  const started = startSessionsLoad(state, { page: page.page, reason })
  return applySessionsPage(started.state, {
    page,
    requestId: started.requests[0].requestId,
  })
}

describe("state survival: Refresh", () => {
  test("an open session still on the page stays open and reloads its newest 50 with one request", () => {
    const before = survivalState()
    const started = startSessionsLoad(before, { page: 1, reason: "refresh" })
    expect(started.requests.map((request) => request.kind)).toEqual([
      "sessions",
    ])
    expect(started.state.expanded).toBe(before.expanded)

    const landed = applySessionsPage(started.state, {
      page: sessionsPageOf({ items: [MULTI, OTHER], total: 2 }),
      requestId: started.requests[0].requestId,
    })
    const entry = landed.state.expanded[MULTI_ID]

    expect(landed.requests).toEqual([
      {
        before: null,
        identity: MULTI_ID,
        key: MULTI.key,
        kind: "session-events",
        limit: 50,
        mode: "replace",
        model: null,
        requestId: entry.requestId!,
        sessionless: false,
      },
    ])
    expect(entry.loading).toBe(true)
    expect(entry.stale).toBe(true)
    expect(entry.items.map((item) => item.id)).toEqual([4, 3, 2, 1])

    const reloaded = applySessionEvents(landed.state, {
      identity: MULTI_ID,
      page: eventsPageOf({
        has_more: true,
        items: [eventOf({ id: 5 }), eventOf({ id: 4 })],
        next_cursor: "4:4",
        total: 5,
      }),
      requestId: entry.requestId!,
    }).state.expanded[MULTI_ID]
    expect(reloaded.items.map((item) => item.id)).toEqual([5, 4])
    expect(reloaded).toMatchObject({
      hasMore: true,
      loading: false,
      nextCursor: "4:4",
      stale: false,
      total: 5,
    })
  })
})

describe("state survival: sessions that move page", () => {
  test("Refresh collapses an open session that moved to another page", () => {
    let state = survivalState()
    state = toggleSession(state, OTHER).state
    const landed = landLoad(
      state,
      "refresh",
      sessionsPageOf({ items: [OTHER], total: 21, total_pages: 2 }),
    )

    expect(Object.keys(landed.state.expanded)).toEqual([OTHER_ID])
    expect(landed.requests).toMatchObject([
      { identity: OTHER_ID, kind: "session-events" },
    ])
  })
})

describe("state survival: the model filter", () => {
  function filteredState() {
    const filtered = toggleModelFilter(survivalState(), MULTI_ID, MODEL_A)
    return applySessionEvents(filtered.state, {
      identity: MULTI_ID,
      page: eventsPageOf({ items: [eventOf({ id: 9 })], model: MODEL_A }),
      requestId: filtered.requests[0].requestId,
    }).state
  }
  const reloadedWith = (byModel: TokenUsageSession["byModel"]) =>
    landLoad(
      filteredState(),
      "refresh",
      sessionsPageOf({ items: [{ ...MULTI, byModel }, OTHER], total: 2 }),
    )

  test("is kept while the reloaded card still lists the model among several", () => {
    const landed = reloadedWith([
      modelEntryOf(MODEL_B),
      modelEntryOf(MODEL_A),
      modelEntryOf("gemini-2.5-pro"),
    ])

    expect(landed.state.expanded[MULTI_ID].filter).toBe(MODEL_A)
    expect(landed.requests).toMatchObject([
      { identity: MULTI_ID, model: MODEL_A },
    ])
  })

  test("clears, and the rows reload unfiltered, when the model is gone", () => {
    const landed = reloadedWith([
      modelEntryOf(MODEL_B),
      modelEntryOf("gemini-2.5-pro"),
    ])

    expect(landed.state.expanded[MULTI_ID].filter).toBeNull()
    expect(landed.requests).toMatchObject([{ identity: MULTI_ID, model: null }])
  })

  test("clears when the card is down to one model, even that one", () => {
    const landed = reloadedWith([modelEntryOf(MODEL_A)])

    expect(landed.state.expanded[MULTI_ID].filter).toBeNull()
    expect(landed.requests).toMatchObject([{ identity: MULTI_ID, model: null }])
  })
})

describe("state survival: period change", () => {
  test("requests page 1 and keeps only the open sessions on it, each reloading once", () => {
    let state = survivalState([MULTI, OTHER])
    state = toggleSession(state, OTHER).state
    const third = sessionOf({ key: "third-session" })
    state = toggleSession(state, third).state

    const started = startSessionsLoad(state, { page: 1, reason: "period" })
    expect(started.requests).toMatchObject([
      { kind: "sessions", page: 1, reason: "period" },
    ])

    const landed = applySessionsPage(started.state, {
      page: sessionsPageOf({
        items: [OTHER, MULTI],
        period: "last_7_days",
        total: 2,
      }),
      requestId: started.requests[0].requestId,
    })

    expect(Object.keys(landed.state.expanded).toSorted()).toEqual(
      [MULTI_ID, OTHER_ID].toSorted(),
    )
    expect(landed.requests).toMatchObject([
      { before: null, identity: OTHER_ID, mode: "replace" },
      { before: null, identity: MULTI_ID, mode: "replace" },
    ])
    const ids = landed.requests.map((request) => request.requestId)
    expect(new Set(ids).size).toBe(2)
    expect(landed.state.expanded[MULTI_ID]).toMatchObject({
      loading: true,
      requestId: ids[1],
      stale: true,
    })
    expect(landed.state.expanded[MULTI_ID].items).toHaveLength(4)
  })
})

describe("state survival: stale events responses", () => {
  test("a response issued before the reloaded page landed is dropped", () => {
    const loaded = survivalState()
    const refreshed = applySessionEvents(
      landLoad(loaded, "refresh", sessionsPageOf({ items: [MULTI], total: 1 }))
        .state,
      {
        identity: MULTI_ID,
        page: eventsPageOf({ items: [eventOf({ id: 99 })] }),
        requestId: loaded.expanded[MULTI_ID].requestId!,
      },
    )
    expect(refreshed.state.expanded[MULTI_ID]).toMatchObject({
      loading: true,
      stale: true,
    })
    expect(
      refreshed.state.expanded[MULTI_ID].items.map((item) => item.id),
    ).toEqual([4, 3, 2, 1])
  })

  test("an in-flight Show more is dropped once a period change lands", () => {
    const opened = toggleSession(loadedState("sessions"), SESSION)
    const loaded = applySessionEvents(opened.state, {
      identity: SESSION_ID,
      page: eventsPageOf({ has_more: true, next_cursor: "1:1", total: 2 }),
      requestId: opened.requests[0].requestId,
    }).state
    const inFlight = showMoreEvents(loaded, SESSION_ID)
    const landed = landLoad(inFlight.state, "period", sessionsPageOf())

    const late = applySessionEvents(landed.state, {
      identity: SESSION_ID,
      page: eventsPageOf({ items: [eventOf({ id: 2 })] }),
      requestId: inFlight.requests[0].requestId,
    })
    expect(late.state).toBe(landed.state)
    const lateError = applySessionEventsError(landed.state, {
      identity: SESSION_ID,
      message: "old period",
      requestId: inFlight.requests[0].requestId,
    })
    expect(lateError.state).toBe(landed.state)
  })

  test("a late response for a session that collapsed on landing is dropped", () => {
    const loaded = survivalState()
    const landed = landLoad(
      loaded,
      "refresh",
      sessionsPageOf({ items: [OTHER], total: 21, total_pages: 2 }),
    )
    const late = applySessionEvents(landed.state, {
      identity: MULTI_ID,
      page: eventsPageOf(),
      requestId: loaded.expanded[MULTI_ID].requestId!,
    })

    expect(late.state).toBe(landed.state)
    expect(late.state.expanded[MULTI_ID]).toBeUndefined()
  })
})

describe("state survival: failed loads", () => {
  function failLoad(
    state: ReturnType<typeof survivalState>,
    reason: "refresh" | "period" | "page",
    page: number,
  ) {
    const started = startSessionsLoad(state, { page, reason })
    return applySessionsError(started.state, {
      message: "Gateway timeout",
      missing: false,
      requestId: started.requests[0].requestId,
    })
  }

  for (const [reason, page] of [
    ["refresh", 1],
    ["period", 1],
    ["page", 2],
  ] as const) {
    test(`a failed ${reason} keeps the loaded list and its open sessions as they were`, () => {
      const filtered = toggleModelFilter(survivalState(), MULTI_ID, MODEL_A)
      const before = applySessionEvents(filtered.state, {
        identity: MULTI_ID,
        page: eventsPageOf({
          has_more: true,
          items: [eventOf({ id: 7 })],
          next_cursor: "7:7",
          total: 3,
        }),
        requestId: filtered.requests[0].requestId,
      }).state
      const failed = failLoad(before, reason, page)

      expect(failed.requests).toEqual([])
      expect(failed.state.page).toBe(before.page)
      expect(failed.state.expanded).toBe(before.expanded)
      expect(failed.state.expanded[MULTI_ID]).toMatchObject({
        filter: MODEL_A,
        hasMore: true,
        loading: false,
        nextCursor: "7:7",
        stale: false,
      })
      expect(failed.state.error).toBe("Gateway timeout")
    })
  }

  test("the error shows above the kept list with its session still open", () => {
    const failed = failLoad(survivalState(), "refresh", 1).state
    const root = parse(
      renderSessionsBody(failed, {
        eventsBody: "",
        nowMs: NOW,
        renderEmptyState: (message) => `<p>${message}</p>`,
        renderError: (message, title) =>
          `<div role="alert">${title}: ${message}</div>`,
      }),
    )
    const panel = root.querySelector('[role="tabpanel"]')

    expect(panel?.firstElementChild?.textContent).toBe(
      "Sessions failed: Gateway timeout",
    )
    expect(
      [...root.querySelectorAll("article")].map((card) =>
        card.getAttribute("data-expanded"),
      ),
    ).toEqual(["true", "false"])
    expect(root.querySelectorAll("tr.session-event-row")).toHaveLength(4)
  })
})

describe("state survival: lost page", () => {
  function lostRefresh() {
    let state = survivalState([MULTI, OTHER])
    state = toggleSession(state, OTHER).state
    const started = startSessionsLoad(state, { page: 3, reason: "refresh" })
    const lost = applySessionsPage(started.state, {
      page: sessionsPageOf({ items: [], page: 3, total: 30, total_pages: 2 }),
      requestId: started.requests[0].requestId,
    })
    return { lost, state }
  }

  test("re-fetches the last page once, leaving the open sessions alone until it lands", () => {
    const { lost, state } = lostRefresh()

    expect(lost.requests).toMatchObject([
      { kind: "sessions", page: 2, reason: "refresh" },
    ])
    expect(lost.state.expanded).toBe(state.expanded)
  })

  test("survivors are applied to the re-fetched page", () => {
    const { lost } = lostRefresh()
    const landed = applySessionsPage(lost.state, {
      page: sessionsPageOf({
        items: [MULTI],
        page: 2,
        total: 30,
        total_pages: 2,
      }),
      requestId: lost.requests[0].requestId,
    })

    expect(Object.keys(landed.state.expanded)).toEqual([MULTI_ID])
    expect(landed.requests).toMatchObject([
      { identity: MULTI_ID, kind: "session-events", mode: "replace" },
    ])
    expect(landed.state.expanded[MULTI_ID].stale).toBe(true)
  })

  test("a re-fetch that is lost too lands as it is, with no second re-fetch", () => {
    const { lost } = lostRefresh()
    const stillLost = sessionsPageOf({
      items: [],
      page: 2,
      total: 10,
      total_pages: 1,
    })
    const landed = applySessionsPage(lost.state, {
      page: stillLost,
      requestId: lost.requests[0].requestId,
    })

    expect(landed.requests).toEqual([])
    expect(landed.state.page).toBe(stillLost)
    expect(landed.state.expanded).toEqual({})
  })
})

describe("state survival: stale rows while a survivor reloads", () => {
  test("old rows are marked stale and the footer loads until the newest rows replace them", () => {
    const landed = landLoad(
      survivalState(),
      "refresh",
      sessionsPageOf({ items: [MULTI, OTHER], total: 2 }),
    )
    const render = (state: typeof landed.state) =>
      parse(
        renderSessionExpansion(MULTI, state.expanded[MULTI_ID], {
          nowMs: NOW,
        }),
      )

    const reloading = render(landed.state)
    expect(
      reloading
        .querySelector(".session-events-wrap")
        ?.getAttribute("data-stale"),
    ).toBe("true")
    const rows = [...reloading.querySelectorAll("tr.session-event-row")]
    expect(rows).toHaveLength(4)
    expect(
      rows.every(
        (row) =>
          row.firstElementChild?.firstElementChild?.className
          === "session-event-model",
      ),
    ).toBe(true)
    expect(reloading.querySelector(".session-events-footer")?.textContent).toBe(
      "Loading events...",
    )

    const reloaded = render(
      applySessionEvents(landed.state, {
        identity: MULTI_ID,
        page: eventsPageOf(),
        requestId: landed.state.expanded[MULTI_ID].requestId!,
      }).state,
    )
    expect(
      reloaded
        .querySelector(".session-events-wrap")
        ?.hasAttribute("data-stale"),
    ).toBe(false)
    expect(reloaded.querySelectorAll("tr.session-event-row")).toHaveLength(1)
  })
})

describe("state survival: a failed survivor reload", () => {
  test("keeps the old rows stale with the error, and Retry repeats the reload", () => {
    const landed = landLoad(
      survivalState(),
      "period",
      sessionsPageOf({ items: [MULTI], total: 1 }),
    )
    const failed = applySessionEventsError(landed.state, {
      identity: MULTI_ID,
      message: "boom",
      requestId: landed.requests[0].requestId,
    }).state
    expect(failed.expanded[MULTI_ID]).toMatchObject({
      error: "boom",
      loading: false,
      stale: true,
    })
    expect(failed.expanded[MULTI_ID].items).toHaveLength(4)

    const retry = retryEvents(failed, MULTI_ID)
    expect(retry.requests).toMatchObject([
      { before: null, identity: MULTI_ID, mode: "replace", model: null },
    ])
    const done = applySessionEvents(retry.state, {
      identity: MULTI_ID,
      page: eventsPageOf(),
      requestId: retry.requests[0].requestId,
    }).state.expanded[MULTI_ID]
    expect(done.items).toHaveLength(1)
    expect(done.stale).toBe(false)
  })
})

describe("state survival: the other §5.10 rows", () => {
  test("a first load lands page 1 with nothing open and no events requests", () => {
    const started = startSessionsLoad(createSessionsState("sessions"), {
      page: 1,
      reason: "initial",
    })
    const landed = applySessionsPage(started.state, {
      page: sessionsPageOf({ items: [MULTI, OTHER], total: 2 }),
      requestId: started.requests[0].requestId,
    })

    expect(started.requests).toMatchObject([{ page: 1 }])
    expect(landed.requests).toEqual([])
    expect(landed.state.expanded).toEqual({})
  })

  test("a page move keeps sessions open until the new page lands, then collapses all", () => {
    const before = survivalState()
    const started = startSessionsLoad(before, { page: 2, reason: "page" })
    expect(started.state.expanded).toBe(before.expanded)

    const landed = applySessionsPage(started.state, {
      page: sessionsPageOf({
        items: [MULTI, OTHER],
        page: 2,
        total: 22,
        total_pages: 2,
      }),
      requestId: started.requests[0].requestId,
    })
    expect(landed.requests).toEqual([])
    expect(landed.state.expanded).toEqual({})
  })

  test("a tab switch either way keeps the page, open sessions, filter and rows", () => {
    const before = toggleModelFilter(survivalState(), MULTI_ID, MODEL_A).state
    const away = setView(before, "events")
    const back = setView(away.state, "sessions")

    expect([away.requests, back.requests]).toEqual([[], []])
    expect(back.state.page).toBe(before.page)
    expect(back.state.expanded).toBe(before.expanded)
  })
})
