import { Hono, type Context } from "hono"

import {
  getTokenUsageDailySummary,
  getTokenUsageEventsPage,
  getTokenUsageSessionEventsPage,
  getTokenUsageSessionsPage,
  getTokenUsageSummary,
  type TokenUsagePeriod,
  type TokenUsageSessionEventsQuery,
  type TokenUsageSessionKey,
} from "~/lib/token-usage"

export const tokenUsageRoute = new Hono()

const periods = new Set<TokenUsagePeriod>([
  "today",
  "this_week",
  "last_7_days",
  "this_month",
  "last_30_days",
  "lifetime",
])
const DEFAULT_EVENTS_PAGE_SIZE = 20
const DEFAULT_SESSIONS_PAGE_SIZE = 20
const DEFAULT_SESSION_EVENTS_LIMIT = 50

const legacyPeriods: Record<string, TokenUsagePeriod> = {
  day: "today",
  week: "last_7_days",
  month: "last_30_days",
}

function parsePeriod(value: string | undefined): TokenUsagePeriod {
  if (periods.has(value as TokenUsagePeriod)) {
    return value as TokenUsagePeriod
  }

  return (value ? legacyPeriods[value] : undefined) ?? "today"
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

tokenUsageRoute.get("/", async (c) => {
  const period = parsePeriod(c.req.query("period"))
  const summary = await getTokenUsageSummary(period)
  return c.json(summary)
})

tokenUsageRoute.get("/daily", async (c) => {
  const period = parsePeriod(c.req.query("period"))
  const summary = await getTokenUsageDailySummary(period)
  return c.json(summary)
})

tokenUsageRoute.get("/events", async (c) => {
  const period = parsePeriod(c.req.query("period"))
  const page = parsePositiveInt(c.req.query("page"), 1)
  const pageSize = parsePositiveInt(
    c.req.query("page_size"),
    DEFAULT_EVENTS_PAGE_SIZE,
  )
  const eventsPage = await getTokenUsageEventsPage({ page, pageSize, period })
  return c.json(eventsPage)
})

tokenUsageRoute.get("/sessions", async (c) => {
  const period = parsePeriod(c.req.query("period"))
  const page = parsePositiveInt(c.req.query("page"), 1)
  const pageSize = parsePositiveInt(
    c.req.query("page_size"),
    DEFAULT_SESSIONS_PAGE_SIZE,
  )
  const sessionsPage = await getTokenUsageSessionsPage({
    page,
    pageSize,
    period,
  })
  return c.json(sessionsPage)
})

/** Exactly one of session_id / trace_id, non-empty; otherwise null. */
function parseSessionKey(
  sessionId: string | undefined,
  traceId: string | undefined,
): TokenUsageSessionKey | null {
  if (sessionId && traceId === undefined) return { session_id: sessionId }
  if (traceId && sessionId === undefined) return { trace_id: traceId }
  return null
}

const CURSOR_PATTERN = /^(\d+):(\d+)$/

/** `<created_at_ms>:<id>`; empty or absent is null, anything else invalid. */
function parseCursor(
  value: string | undefined,
): TokenUsageSessionEventsQuery["before"] | "invalid" {
  if (!value) return null
  const match = CURSOR_PATTERN.exec(value)
  const createdAtMs = Number(match?.[1])
  const id = Number(match?.[2])
  return Number.isSafeInteger(createdAtMs) && Number.isSafeInteger(id) ?
      { createdAtMs, id }
    : "invalid"
}

function badRequest(c: Context, message: string) {
  return c.json({ error: { message } }, 400)
}

tokenUsageRoute.get("/session-events", async (c) => {
  const key = parseSessionKey(
    c.req.query("session_id"),
    c.req.query("trace_id"),
  )
  if (!key) {
    return badRequest(
      c,
      "Exactly one of session_id or trace_id is required, and it must be non-empty.",
    )
  }
  const before = parseCursor(c.req.query("before"))
  if (before === "invalid") {
    return badRequest(
      c,
      "before must be a cursor of the form <created_at_ms>:<id>.",
    )
  }

  const sessionEventsPage = await getTokenUsageSessionEventsPage({
    before,
    key,
    limit: parsePositiveInt(c.req.query("limit"), DEFAULT_SESSION_EVENTS_LIMIT),
    model: c.req.query("model") || null,
    period: parsePeriod(c.req.query("period")),
  })
  return c.json(sessionEventsPage)
})
