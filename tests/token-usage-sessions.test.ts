import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test"
import { Hono } from "hono"

import {
  closeUsageStore,
  createEmptyEventsPage,
  createEmptySessionEventsPage,
  createEmptySessionsPage,
  type TokenUsageSession,
  type TokenUsageSessionEventsPage,
  type TokenUsageSessionsPage,
  type TokenUsageSummary,
} from "~/lib/token-usage"
import {
  enqueueTokenUsageWrite,
  type PersistedTokenUsageEvent,
} from "~/lib/token-usage/store"
import { traceIdMiddleware } from "~/lib/trace"
import { tokenUsageRoute } from "~/routes/token-usage/route"

const DB_PATH_ENV = "COPILOT_API_SQLITE_DB_PATH"
const NOW = new Date(2026, 5, 15, 12, 0, 0, 0)
const MIN = 60_000

beforeEach(async () => {
  process.env[DB_PATH_ENV] = ":memory:"
  await closeUsageStore()
  setSystemTime(NOW)
})

afterEach(async () => {
  await closeUsageStore()
  setSystemTime()
  Reflect.deleteProperty(process.env, DB_PATH_ENV)
})

function createTokenUsageApp(): Hono {
  const app = new Hono()
  app.use(traceIdMiddleware)
  app.route("/token-usage", tokenUsageRoute)
  return app
}

/** Minutes before NOW, as an epoch-ms timestamp. */
function ago(minutes: number): number {
  return NOW.getTime() - minutes * MIN
}

/** Builds a full persisted event; override anything. Writes via `seed`. */
export function persistedEvent(
  overrides: Partial<PersistedTokenUsageEvent> = {},
): PersistedTokenUsageEvent {
  const createdAtMs = overrides.created_at_ms ?? ago(1)
  return {
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cost_currency: null,
    cost_source: null,
    created_at_ms: createdAtMs,
    created_at_utc: new Date(createdAtMs).toISOString(),
    endpoint: "messages",
    input_tokens: 10,
    model: "model-a",
    output_tokens: 5,
    provider_name: null,
    session_id: "",
    source: "copilot",
    total_cost_nanos: null,
    total_nano_aiu: null,
    total_tokens: 15,
    trace_id: "trace-default",
    user_id: "user",
    ...overrides,
  }
}

function seed(...events: Array<PersistedTokenUsageEvent>): void {
  for (const event of events) enqueueTokenUsageWrite(event)
}

async function fetchSessions(
  query = "period=today",
): Promise<TokenUsageSessionsPage> {
  const response = await createTokenUsageApp().request(
    `/token-usage/sessions?${query}`,
  )
  expect(response.status).toBe(200)
  return (await response.json()) as TokenUsageSessionsPage
}

describe("sessions grouping", () => {
  test("sessionless events sharing a trace form one session; a trace id equal to a session id is separate and sorts after on the tied key", async () => {
    seed(
      persistedEvent({
        created_at_ms: ago(30),
        session_id: "abc",
        trace_id: "t1",
      }),
      persistedEvent({ created_at_ms: ago(20), trace_id: "abc" }),
      persistedEvent({ created_at_ms: ago(10), trace_id: "abc" }),
    )

    const page = await fetchSessions()

    expect(page.total).toBe(2)
    expect(
      page.items.map((s) => [s.key, s.sessionless, s.request_count]),
    ).toEqual([
      ["abc", true, 2],
      ["abc", false, 1],
    ])
    expect(page.items[0].first_ms).toBe(ago(20))
    expect(page.items[0].last_ms).toBe(ago(10))
  })

  test("tied key sorts the session-id row first when last_ms is equal", async () => {
    seed(
      persistedEvent({ created_at_ms: ago(5), trace_id: "abc" }),
      persistedEvent({
        created_at_ms: ago(5),
        session_id: "abc",
        trace_id: "t1",
      }),
    )

    const page = await fetchSessions()

    expect(page.items.map((s) => s.sessionless)).toEqual([false, true])
  })
})

describe("empty builders", () => {
  test("createEmptySessionsPage clamps and echoes", () => {
    const page = createEmptySessionsPage({
      page: 0,
      pageSize: 500,
      period: "today",
    })
    expect(page).toMatchObject({
      items: [],
      page: 1,
      page_size: 100,
      period: "today",
      total: 0,
      total_pages: 1,
    })
    expect(page.range.end_ms).toBe(NOW.getTime() + 1)
  })

  test("createEmptySessionEventsPage echoes the key, the filter and the period", () => {
    const page = createEmptySessionEventsPage({
      before: { createdAtMs: 1, id: 1 },
      key: { trace_id: "t" },
      limit: 500,
      model: "m",
      period: "today",
    })
    expect(page).toEqual({
      has_more: false,
      items: [],
      model: "m",
      next_cursor: null,
      period: "today",
      range: {
        end_ms: NOW.getTime() + 1,
        end_utc: new Date(NOW.getTime() + 1).toISOString(),
        start_ms: new Date(2026, 5, 15).getTime(),
        start_utc: new Date(2026, 5, 15).toISOString(),
      },
      session_id: null,
      total: 0,
      trace_id: "t",
    })
    expect(
      createEmptySessionEventsPage({
        before: null,
        key: { session_id: "s" },
        limit: 50,
        model: null,
        period: "lifetime",
      }),
    ).toMatchObject({ model: null, session_id: "s", trace_id: null })
  })

  test("createEmptyEventsPage is exported", () => {
    const page = createEmptyEventsPage({
      page: 3,
      pageSize: 20,
      period: "today",
    })
    expect(page).toMatchObject({
      items: [],
      page: 3,
      page_size: 20,
      total: 0,
      total_pages: 1,
    })
  })
})

describe("sessions aggregates", () => {
  test("multi-model, multi-currency session with sorted endpoints and per-model ranges", async () => {
    seed(
      persistedEvent({
        cost_currency: "USD",
        created_at_ms: ago(50),
        endpoint: "responses",
        model: "small",
        session_id: "s1",
        total_cost_nanos: 1_000_000_000,
        total_tokens: 10,
      }),
      persistedEvent({
        cost_currency: "USD",
        created_at_ms: ago(40),
        endpoint: "messages",
        model: "big",
        session_id: "s1",
        total_cost_nanos: 2_000_000_000,
        total_tokens: 100,
      }),
      persistedEvent({
        cost_currency: "CNY",
        created_at_ms: ago(30),
        endpoint: "messages",
        model: "big",
        session_id: "s1",
        total_cost_nanos: 5_000_000_000,
        total_tokens: 100,
      }),
      persistedEvent({
        created_at_ms: ago(20),
        model: "alpha",
        session_id: "s1",
        total_tokens: 100,
      }),
    )

    const { items } = await fetchSessions()

    expect(items).toHaveLength(1)
    const [session] = items
    expect(session.request_count).toBe(4)
    expect(session.total_tokens).toBe(310)
    expect(session.endpoints).toEqual(["messages", "responses"])
    expect(session.costs.map((c) => [c.currency, c.total_cost_nanos])).toEqual([
      ["CNY", 5_000_000_000],
      ["USD", 3_000_000_000],
    ])
    expect(session.byModel.map((m) => m.model)).toEqual([
      "big",
      "alpha",
      "small",
    ])
    const big = session.byModel[0]
    expect([big.first_ms, big.last_ms, big.request_count]).toEqual([
      ago(40),
      ago(30),
      2,
    ])
    expect(big.costs.map((c) => c.currency)).toEqual(["CNY", "USD"])
    expect(session.byModel[1].costs).toEqual([])
  })

  test("a session straddling the period start counts only in-period events", async () => {
    const todayStart = new Date(2026, 5, 15).getTime()
    seed(
      persistedEvent({ created_at_ms: todayStart - MIN, session_id: "s" }),
      persistedEvent({ created_at_ms: todayStart, session_id: "s" }),
      persistedEvent({ created_at_ms: todayStart + MIN, session_id: "s" }),
    )

    const { items } = await fetchSessions()

    expect(items[0].request_count).toBe(2)
    expect(items[0].first_ms).toBe(todayStart)
    expect(items[0].byModel[0].request_count).toBe(2)
  })
})

describe("sessions paging", () => {
  test("ties on last_ms order by key and never repeat or drop across a page boundary", async () => {
    seed(
      ...["d", "b", "a", "c"].map((id) =>
        persistedEvent({ created_at_ms: ago(5), session_id: id }),
      ),
      persistedEvent({ created_at_ms: ago(1), session_id: "newest" }),
    )

    const keys: Array<string> = []
    for (const page of [1, 2, 3]) {
      const body = await fetchSessions(`period=today&page=${page}&page_size=2`)
      expect(body.total).toBe(5)
      expect(body.total_pages).toBe(3)
      keys.push(...body.items.map((s) => s.key))
    }

    expect(keys).toEqual(["newest", "a", "b", "c", "d"])
  })

  test("a page past the end echoes the page with no items", async () => {
    seed(persistedEvent({ session_id: "only" }))

    const body = await fetchSessions("period=today&page=9&page_size=5")

    expect(body).toMatchObject({
      items: [],
      page: 9,
      page_size: 5,
      total: 1,
      total_pages: 1,
    })
  })

  test("params fall back or clamp as for /events", async () => {
    expect(
      await fetchSessions("period=today&page=x&page_size=y"),
    ).toMatchObject({
      page: 1,
      page_size: 20,
    })
    expect(await fetchSessions("period=today&page_size=500")).toMatchObject({
      page_size: 100,
    })
    expect(await fetchSessions("period=week")).toMatchObject({
      period: "last_7_days",
    })
  })

  test("an empty store returns an empty first page", async () => {
    expect(await fetchSessions()).toMatchObject({
      items: [],
      total: 0,
      total_pages: 1,
    })
  })
})

describe("sessions reconcile with the summary", () => {
  test.each(["today", "last_7_days"] as const)(
    "session sums equal summary totals for %s",
    async (period) => {
      const dayStart = new Date(2026, 5, 15).getTime()
      seed(
        // straddles today's start
        persistedEvent({
          created_at_ms: dayStart - 2 * MIN,
          session_id: "x",
          total_tokens: 7,
        }),
        persistedEvent({
          created_at_ms: dayStart + MIN,
          session_id: "x",
          total_tokens: 11,
          input_tokens: 4,
        }),
        // sessionless pair
        persistedEvent({
          created_at_ms: ago(30),
          trace_id: "tr",
          cache_read_input_tokens: 3,
        }),
        persistedEvent({
          created_at_ms: ago(29),
          trace_id: "tr",
          cache_creation_input_tokens: 2,
        }),
        // multi-currency
        persistedEvent({
          created_at_ms: ago(20),
          session_id: "m",
          cost_currency: "USD",
          total_cost_nanos: 3_000_000_000,
        }),
        persistedEvent({
          created_at_ms: ago(19),
          session_id: "m",
          cost_currency: "CNY",
          total_cost_nanos: 4_000_000_000,
        }),
        persistedEvent({
          created_at_ms: ago(18),
          session_id: "m",
          cost_currency: "USD",
          total_cost_nanos: 1_000_000_000,
        }),
        persistedEvent({ created_at_ms: ago(17), session_id: "m" }),
      )
      const app = createTokenUsageApp()
      const summary = (await (
        await app.request(`/token-usage?period=${period}`)
      ).json()) as TokenUsageSummary

      const sessions: Array<TokenUsageSession> = []
      for (let page = 1; ; page++) {
        const body = (await (
          await app.request(
            `/token-usage/sessions?period=${period}&page=${page}&page_size=1`,
          )
        ).json()) as TokenUsageSessionsPage
        sessions.push(...body.items)
        if (page >= body.total_pages) break
      }

      const sum = (pick: (s: TokenUsageSession) => number) =>
        sessions.reduce((acc, s) => acc + pick(s), 0)
      const { totals } = summary
      expect(sum((s) => s.request_count)).toBe(totals.request_count)
      expect(sum((s) => s.input_tokens)).toBe(totals.input_tokens)
      expect(sum((s) => s.output_tokens)).toBe(totals.output_tokens)
      expect(sum((s) => s.cache_read_input_tokens)).toBe(
        totals.cache_read_input_tokens,
      )
      expect(sum((s) => s.cache_creation_input_tokens)).toBe(
        totals.cache_creation_input_tokens,
      )
      expect(sum((s) => s.total_tokens)).toBe(totals.total_tokens)
      const costByCurrency = new Map<string, number>()
      for (const cost of sessions.flatMap((s) => s.costs)) {
        costByCurrency.set(
          cost.currency,
          (costByCurrency.get(cost.currency) ?? 0) + cost.total_cost_nanos,
        )
      }
      expect(
        [...costByCurrency].sort(([a], [b]) => a.localeCompare(b)),
      ).toEqual(totals.costs.map((c) => [c.currency, c.total_cost_nanos]))
      expect(totals.request_count).toBe(period === "today" ? 7 : 8)
    },
  )
})

async function fetchSessionEvents(
  query: string,
): Promise<TokenUsageSessionEventsPage> {
  const response = await createTokenUsageApp().request(
    `/token-usage/session-events?${query}`,
  )
  expect(response.status).toBe(200)
  return (await response.json()) as TokenUsageSessionEventsPage
}

describe("session events", () => {
  test("lists one session's events newest first and echoes the key", async () => {
    seed(
      persistedEvent({ created_at_ms: ago(30), session_id: "s", model: "a" }),
      persistedEvent({ created_at_ms: ago(20), session_id: "other" }),
      persistedEvent({ created_at_ms: ago(10), session_id: "s", model: "b" }),
    )

    const body = await fetchSessionEvents("period=today&session_id=s")

    expect(body.items.map((e) => [e.created_at_ms, e.model])).toEqual([
      [ago(10), "b"],
      [ago(30), "a"],
    ])
    expect(body).toMatchObject({
      has_more: false,
      model: null,
      next_cursor: null,
      period: "today",
      session_id: "s",
      total: 2,
      trace_id: null,
    })
    expect(body.range.end_ms).toBe(NOW.getTime() + 1)
  })

  test("a trace id key lists only that trace's sessionless events", async () => {
    seed(
      persistedEvent({ created_at_ms: ago(30), trace_id: "t" }),
      persistedEvent({
        created_at_ms: ago(20),
        session_id: "x",
        trace_id: "t",
      }),
      persistedEvent({ created_at_ms: ago(10), trace_id: "t" }),
      persistedEvent({ created_at_ms: ago(5), trace_id: "other" }),
    )

    const body = await fetchSessionEvents("period=today&trace_id=t")

    expect(body.items.map((e) => [e.created_at_ms, e.session_id])).toEqual([
      [ago(10), ""],
      [ago(30), ""],
    ])
    expect(body).toMatchObject({ session_id: null, total: 2, trace_id: "t" })
  })

  test("prev_ms is the previous in-period event, null for the first even when the session began before the period", async () => {
    const todayStart = new Date(2026, 5, 15).getTime()
    seed(
      persistedEvent({ created_at_ms: todayStart - MIN, session_id: "s" }),
      persistedEvent({ created_at_ms: todayStart, session_id: "s" }),
      persistedEvent({ created_at_ms: todayStart + 5 * MIN, session_id: "s" }),
    )

    const body = await fetchSessionEvents("period=today&session_id=s")

    expect(body.items.map((e) => [e.created_at_ms, e.prev_ms])).toEqual([
      [todayStart + 5 * MIN, todayStart],
      [todayStart, null],
    ])
    expect(body.total).toBe(2)
  })

  test("cursor paging ignores newer inserts and neither repeats nor drops rows", async () => {
    // ids 1..60 from ago(60) to ago(1)
    seed(
      ...Array.from({ length: 60 }, (_, i) =>
        persistedEvent({ created_at_ms: ago(60 - i), session_id: "s" }),
      ),
    )

    const first = await fetchSessionEvents("period=today&session_id=s&limit=50")
    expect(first.items).toHaveLength(50)
    expect(first).toMatchObject({
      has_more: true,
      next_cursor: `${ago(50)}:11`,
      total: 60,
    })
    expect(first.items.at(-1)?.prev_ms).toBe(ago(51))

    seed(persistedEvent({ created_at_ms: ago(0), session_id: "s" }))
    const second = await fetchSessionEvents(
      `period=today&session_id=s&limit=50&before=${first.next_cursor}`,
    )

    expect(second.items.map((e) => e.created_at_ms)).toEqual(
      Array.from({ length: 10 }, (_, i) => ago(51 + i)),
    )
    expect(second).toMatchObject({
      has_more: false,
      next_cursor: null,
      total: 61,
    })
    expect(second.items[0].prev_ms).toBe(ago(52))
    expect(second.items.at(-1)?.prev_ms).toBeNull()
    const ids = [...first.items, ...second.items].map((e) => e.id)
    expect(new Set(ids).size).toBe(60)
  })

  test("a cursor between rows sharing a timestamp breaks the tie by id", async () => {
    seed(
      ...[1, 2, 3].map(() =>
        persistedEvent({ created_at_ms: ago(5), session_id: "s" }),
      ),
    )

    const first = await fetchSessionEvents("period=today&session_id=s&limit=2")
    const second = await fetchSessionEvents(
      `period=today&session_id=s&limit=2&before=${first.next_cursor}`,
    )

    expect(first.items.map((e) => e.id)).toEqual([3, 2])
    expect(first.next_cursor).toBe(`${ago(5)}:2`)
    expect(second.items.map((e) => e.id)).toEqual([1])
  })

  test("a model filter matches exactly, echoes, and its gaps skip other models' events", async () => {
    seed(
      persistedEvent({ created_at_ms: ago(30), model: "a", session_id: "s" }),
      persistedEvent({ created_at_ms: ago(20), model: "b", session_id: "s" }),
      persistedEvent({
        created_at_ms: ago(15),
        model: "a-mini",
        session_id: "s",
      }),
      persistedEvent({ created_at_ms: ago(10), model: "a", session_id: "s" }),
    )

    const filtered = await fetchSessionEvents(
      "period=today&session_id=s&model=a",
    )

    expect(filtered.items.map((e) => [e.created_at_ms, e.prev_ms])).toEqual([
      [ago(10), ago(30)],
      [ago(30), null],
    ])
    expect(filtered).toMatchObject({ model: "a", total: 2 })

    const unfiltered = await fetchSessionEvents(
      "period=today&session_id=s&model=",
    )
    expect(unfiltered).toMatchObject({ model: null, total: 4 })
    expect(unfiltered.items[0].prev_ms).toBe(ago(15))
  })
})

describe("session events validation", () => {
  async function expectBadRequest(query: string): Promise<void> {
    const response = await createTokenUsageApp().request(
      `/token-usage/session-events?${query}`,
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { message: expect.any(String) as string },
    })
  }

  test.each([
    ["neither key", "period=today"],
    ["both keys", "session_id=a&trace_id=b"],
    ["both keys, one empty", "session_id=a&trace_id="],
    ["an empty session_id", "session_id="],
    ["an empty trace_id", "trace_id="],
  ])("%s is a 400", async (_, query) => {
    await expectBadRequest(query)
  })

  test.each([
    "abc",
    "1:",
    ":1",
    "1:2:3",
    "-1:2",
    "1.5:2",
    "9007199254740992:1",
    "1:9007199254740992",
  ])("before=%s is a 400", async (before) => {
    await expectBadRequest(`session_id=s&before=${encodeURIComponent(before)}`)
  })

  test("an empty before is treated as absent", async () => {
    seed(persistedEvent({ session_id: "s" }))

    const body = await fetchSessionEvents("period=today&session_id=s&before=")

    expect(body).toMatchObject({ has_more: false, total: 1 })
    expect(body.items).toHaveLength(1)
  })

  test("limit is capped at 100 and falls back to 50", async () => {
    seed(
      ...Array.from({ length: 101 }, (_, i) =>
        persistedEvent({ created_at_ms: ago(101 - i), session_id: "s" }),
      ),
    )

    for (const [limit, length] of [
      ["500", 100],
      ["x", 50],
      ["0", 50],
      ["7", 7],
    ] as const) {
      const body = await fetchSessionEvents(
        `period=today&session_id=s&limit=${limit}`,
      )
      expect(body.items).toHaveLength(length)
      expect(body.has_more).toBe(true)
    }
  })

  test.each([
    ["an unknown key", "session_id=nope"],
    ["a filter matching nothing", "session_id=s&model=nope"],
  ])("%s returns an empty page", async (_, query) => {
    seed(persistedEvent({ session_id: "s" }))

    const body = await fetchSessionEvents(`period=today&${query}`)

    expect(body).toMatchObject({
      has_more: false,
      items: [],
      next_cursor: null,
      total: 0,
    })
  })

  test("the largest safe-integer cursor is accepted", async () => {
    seed(persistedEvent({ session_id: "s" }))

    const body = await fetchSessionEvents(
      "period=today&session_id=s&before=9007199254740991:9007199254740991",
    )

    expect(body.items).toHaveLength(1)
  })
})
