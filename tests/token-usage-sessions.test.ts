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
  type TokenUsageSessionsPage,
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
