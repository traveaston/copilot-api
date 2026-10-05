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
  createEmptySessionsPage,
  type TokenUsageSession,
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
