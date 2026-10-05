// @ts-check

/** @typedef {import("~/lib/token-usage").TokenUsagePeriod} TokenUsagePeriod */
/** @typedef {"sessions" | "events"} SessionsView */
/** @typedef {import("~/lib/token-usage").TokenUsageSession} TokenUsageSession */
/** @typedef {import("~/lib/token-usage").TokenUsageCost} TokenUsageCost */
/** @typedef {import("~/lib/token-usage").TokenUsageSessionsPage} TokenUsageSessionsPage */
/** @typedef {import("~/lib/token-usage").TokenUsageSessionEventRecord} TokenUsageSessionEventRecord */
/** @typedef {import("~/lib/token-usage").TokenUsageSessionEventsPage} TokenUsageSessionEventsPage */

/**
 * Currency symbols, identical to the map in the inline `formatCurrencyAmount`.
 * @type {Readonly<Record<string, string>>}
 */
export const CURRENCY_SYMBOLS = Object.freeze({
  CNY: "¥",
  USD: "$",
})

/** Sessions per page on the Sessions tab. */
export const SESSIONS_PAGE_SIZE = 20

/** Events fetched per request inside an expanded session. */
export const SESSION_EVENTS_LIMIT = 50

/** A gap between consecutive events longer than this is shown as a long gap (15 minutes). */
export const LONG_GAP_MS = 900000

/**
 * Escapes a value for safe insertion into HTML text or attributes.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

/**
 * Appends a path segment to an absolute URL's path, dropping its query and hash.
 * @param {string} baseUrl
 * @param {string} segment
 * @returns {URL}
 */
function appendPath(baseUrl, segment) {
  const url = new URL(baseUrl)
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${segment}`
  url.search = ""
  url.hash = ""
  return url
}

/**
 * Builds the sessions page URL from the absolute `/token-usage` URL.
 * @param {string} tokenUsageUrl
 * @param {{ period: TokenUsagePeriod, page: number, pageSize: number }} options
 * @returns {string}
 */
export function buildSessionsUrl(tokenUsageUrl, { period, page, pageSize }) {
  const url = appendPath(tokenUsageUrl, "sessions")
  url.searchParams.set("period", period)
  url.searchParams.set("page", String(page))
  url.searchParams.set("page_size", String(pageSize))
  return url.toString()
}

/**
 * Reads the Request Events tab choice from a location search string.
 * @param {string} search
 * @returns {SessionsView}
 */
export function readViewParam(search) {
  return new URLSearchParams(search).get("view") === "events" ?
      "events"
    : "sessions"
}

/**
 * Writes the tab choice into an href: `view=events` for All events, no `view` for Sessions.
 * @param {string} href
 * @param {SessionsView} view
 * @returns {string}
 */
export function writeViewParam(href, view) {
  const url = new URL(href)
  if (view === "events") {
    url.searchParams.set("view", "events")
  } else {
    url.searchParams.delete("view")
  }
  return url.toString()
}

/**
 * A session's identity: its key typed by kind, so a trace id that equals a session id stays distinct.
 * @param {Pick<TokenUsageSession, "key" | "sessionless">} session
 * @returns {string}
 */
export function identityOf(session) {
  return `${session.sessionless ? "t" : "s"}:${session.key}`
}

const compactFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})

/**
 * Integer with default-locale grouping, as the inline `formatNumber`; non-finite shows "0".
 * @param {number} value
 * @returns {string}
 */
export function formatInteger(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "0"
}

/**
 * Compact number: "2.4M", "85K", "950".
 * @param {number} value
 * @returns {string}
 */
export function formatCompact(value) {
  return compactFormat.format(Number.isFinite(value) ? value : 0)
}

/**
 * 12-hour local clock: "9:41 PM", or "9:41:07 PM" with seconds.
 * @param {number} ms
 * @param {{ seconds?: boolean }} [options]
 * @returns {string}
 */
export function formatClock(ms, { seconds = false } = {}) {
  return new Date(ms)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...(seconds ? { second: "2-digit" } : {}),
    })
    .replaceAll(" ", " ")
}

/**
 * Local day label: "Sep 29", or "Dec 31, 2025" when the year differs from now's.
 * @param {number} ms
 * @param {number} nowMs
 * @returns {string}
 */
export function formatDayLabel(ms, nowMs) {
  const date = new Date(ms)
  const sameYear = date.getFullYear() === new Date(nowMs).getFullYear()
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  })
}

/**
 * Whether two instants fall on the same local calendar date.
 * @param {number} aMs
 * @param {number} bMs
 * @returns {boolean}
 */
export function isSameDay(aMs, bMs) {
  const a = new Date(aMs)
  const b = new Date(bMs)
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  )
}

/**
 * Active range: "Sep 29 9:02 AM → 1:14 PM", or both days when it crosses midnight.
 * @param {number} firstMs
 * @param {number} lastMs
 * @param {number} nowMs
 * @returns {string}
 */
export function formatActiveRange(firstMs, lastMs, nowMs) {
  const start = `${formatDayLabel(firstMs, nowMs)} ${formatClock(firstMs)}`
  const end =
    isSameDay(firstMs, lastMs) ?
      formatClock(lastMs)
    : `${formatDayLabel(lastMs, nowMs)} ${formatClock(lastMs)}`
  return `${start} → ${end}`
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * Floored duration: "<1m", "42m", "4h 12m", "1h", "2d 3h", "2d".
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms < MINUTE_MS) return "<1m"
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)}m`
  if (ms < DAY_MS) {
    return joinUnits(
      `${Math.floor(ms / HOUR_MS)}h`,
      Math.floor((ms % HOUR_MS) / MINUTE_MS),
      "m",
    )
  }
  return joinUnits(
    `${Math.floor(ms / DAY_MS)}d`,
    Math.floor((ms % DAY_MS) / HOUR_MS),
    "h",
  )
}

/**
 * Joins a leading unit with a second unit, dropping the second when it is zero.
 * @param {string} first
 * @param {number} second
 * @param {string} unit
 * @returns {string}
 */
function joinUnits(first, second, unit) {
  return second === 0 ? first : `${first} ${second}${unit}`
}

/**
 * Age of `lastMs` at `nowMs`: "just now", "12m ago", "3h ago", "2d ago".
 * @param {number} lastMs
 * @param {number} nowMs
 * @returns {string}
 */
export function formatAge(lastMs, nowMs) {
  const age = nowMs - lastMs
  if (age < MINUTE_MS) return "just now"
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)}m ago`
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)}h ago`
  return `${Math.floor(age / DAY_MS)}d ago`
}

/**
 * Short key: the first 8 characters, prefixed "trace " when sessionless.
 * @param {Pick<TokenUsageSession, "key" | "sessionless">} session
 * @returns {string}
 */
export function formatShortKey(session) {
  const short = session.key.slice(0, 8)
  return session.sessionless ? `trace ${short}` : short
}

/**
 * Count with its noun: "1 request", "1,234 requests".
 * @param {number} count
 * @param {string} noun
 * @returns {string}
 */
export function pluralize(count, noun) {
  return `${formatInteger(count)} ${count === 1 ? noun : `${noun}s`}`
}

/**
 * Cost amount: 2 decimals from 0.01 up (and at or below 0), else 2 significant digits.
 * @param {number} amount
 * @returns {string}
 */
export function formatCostAmount(amount) {
  if (amount >= 0.01 || amount <= 0) return amount.toFixed(2)
  const fixed = amount.toFixed(1 - Math.floor(Math.log10(amount)))
  return Number(fixed) >= 0.01 ? "0.01" : fixed
}

/**
 * Cost list as HTML: one entry per currency, sorted by code, digits past the
 * second decimal dimmed. No costs, or null, shows "—".
 * @param {ReadonlyArray<TokenUsageCost> | null | undefined} costs
 * @returns {string}
 */
export function formatCostList(costs) {
  if (!costs || costs.length === 0) return "—"
  return costs
    .map((cost) => ({
      amount: cost.amount,
      code: String(cost.currency).trim().toUpperCase(),
    }))
    .sort((a, b) =>
      a.code < b.code ? -1
      : a.code > b.code ? 1
      : 0,
    )
    .map(({ amount, code }) => {
      const prefix = CURRENCY_SYMBOLS[code] ?? `${code} `
      const [whole, decimals] = formatCostAmount(amount).split(".")
      const dimmed =
        decimals.length > 2 ?
          `<span class="sessions-cost-dim">${decimals.slice(2)}</span>`
        : ""
      return `${escapeHtml(prefix)}${whole}.${decimals.slice(0, 2)}${dimmed}`
    })
    .join(" · ")
}

/**
 * @typedef {"initial" | "refresh" | "period" | "page"} SessionsLoadReason
 *
 * @typedef {object} SessionsRequest
 * @property {"sessions"} kind
 * @property {number} requestId
 * @property {number} page
 * @property {SessionsLoadReason} reason
 *
 * @typedef {object} SessionsState
 * @property {SessionsView} view The selected Request Events tab.
 * @property {boolean} available False after a 404 hides the Sessions tab.
 * @property {TokenUsageSessionsPage | null} page The displayed sessions page.
 * @property {boolean} loading Whether a list request is in flight.
 * @property {SessionsLoadReason | null} reason Why the in-flight list load started.
 * @property {string | null} error The last list error, shown above the list.
 * @property {number | null} requestId The latest list request id; other responses are dropped.
 * @property {number} nextRequestId The request id counter.
 * @property {boolean} lostPageRefetched Whether this load already re-fetched a lost page.
 * @property {Readonly<Record<string, SessionExpansion>>} expanded Open sessions by identity.
 *
 * @typedef {{ state: SessionsState, requests: SessionsRequest[] }} SessionsTransition
 */

/**
 * The initial Sessions state for a tab choice read from the URL.
 * @param {SessionsView} view
 * @returns {SessionsState}
 */
export function createSessionsState(view) {
  return {
    available: true,
    error: null,
    expanded: {},
    loading: false,
    lostPageRefetched: false,
    nextRequestId: 1,
    page: null,
    reason: null,
    requestId: null,
    view,
  }
}

/**
 * Issues a list request with a fresh id from the state's counter.
 * @param {SessionsState} state
 * @param {number} page
 * @param {SessionsLoadReason} reason
 * @returns {SessionsTransition}
 */
function requestSessionsPage(state, page, reason) {
  const requestId = state.nextRequestId
  return {
    requests: [{ kind: "sessions", page, reason, requestId }],
    state: {
      ...state,
      error: null,
      loading: true,
      nextRequestId: requestId + 1,
      reason,
      requestId,
    },
  }
}

/**
 * Starts a sessions list load: a full load (`initial`, `refresh`, `period`) or a page move.
 * @param {SessionsState} state
 * @param {{ page: number, reason: SessionsLoadReason }} options
 * @returns {SessionsTransition}
 */
export function startSessionsLoad(state, { page, reason }) {
  return requestSessionsPage(
    { ...state, lostPageRefetched: false },
    page,
    reason,
  )
}

/**
 * Applies a sessions page response. Drops a stale response, re-fetches a page
 * past the end once per load, then settles the open sessions on the new page.
 * @param {SessionsState} state
 * @param {{ requestId: number, page: TokenUsageSessionsPage }} response
 * @returns {SessionsPageTransition}
 */
export function applySessionsPage(state, { requestId, page }) {
  if (requestId !== state.requestId) return { requests: [], state }
  if (
    page.page > page.total_pages
    && page.total > 0
    && !state.lostPageRefetched
    && state.reason
  ) {
    return requestSessionsPage(
      { ...state, lostPageRefetched: true },
      page.total_pages,
      state.reason,
    )
  }
  return settleExpansions(
    { ...state, available: true, loading: false, page, reason: null },
    page,
    state.reason,
  )
}

/**
 * Applies a failed list request. `missing` (a 404) hides the Sessions tab
 * without touching the tab choice.
 * @param {SessionsState} state
 * @param {{ requestId: number, message: string, missing: boolean }} failure
 * @returns {SessionsTransition}
 */
export function applySessionsError(state, { requestId, message, missing }) {
  if (requestId !== state.requestId) return { requests: [], state }
  if (missing) {
    return {
      requests: [],
      state: {
        ...state,
        available: false,
        error: null,
        loading: false,
        page: null,
        reason: null,
      },
    }
  }
  return {
    requests: [],
    state: {
      ...state,
      error: message,
      loading: false,
      reason: null,
    },
  }
}

/**
 * Selects a Request Events tab. Switching never fetches.
 * @param {SessionsState} state
 * @param {SessionsView} view
 * @returns {SessionsTransition}
 */
export function setView(state, view) {
  return { requests: [], state: { ...state, view } }
}

/** The Request Events tab panel's id, shared by the tabs and the body. */
const REQUEST_EVENTS_PANEL_ID = "request-events-panel"

/**
 * @param {SessionsView} view
 * @returns {string}
 */
function tabIdOf(view) {
  return `request-events-tab-${view}`
}

/**
 * The Request Events tablist: Sessions and All events, each with its count.
 * @param {SessionsState} state
 * @param {{ eventsCount: number | null | undefined }} options The summary's request count, or null until it loads.
 * @returns {string}
 */
export function renderSessionsTabs(state, { eventsCount }) {
  if (!state.available) return ""
  /**
   * @param {SessionsView} view
   * @param {string} label
   * @param {number | null | undefined} count
   */
  const tab = (view, label, count) => {
    const selected = state.view === view
    const countHtml =
      typeof count === "number" ?
        ` <span class="sessions-tab-count">${formatInteger(count)}</span>`
      : ""
    return `<button type="button" role="tab" id="${tabIdOf(view)}" class="sessions-tab" aria-selected="${selected}" aria-controls="${REQUEST_EVENTS_PANEL_ID}" tabindex="${selected ? 0 : -1}" data-session-action="tab" data-session-view="${view}">${label}${countHtml}</button>`
  }
  return `<div class="sessions-tabs" role="tablist" aria-label="Request Events">${tab("sessions", "Sessions", state.page?.total)}${tab("events", "All events", eventsCount)}</div>`
}

/**
 * The page count shown for a loaded page; an empty period counts as one page.
 * @param {TokenUsageSessionsPage} page
 * @returns {number}
 */
function totalPagesOf(page) {
  return Math.max(page.total_pages, 1)
}

/**
 * The Sessions tab's meta line under the tablist.
 * @param {SessionsState} state
 * @returns {string}
 */
export function renderSessionsMeta(state) {
  let text = "No sessions loaded."
  if (state.page) {
    text = `Page ${formatInteger(state.page.page)} / ${formatInteger(totalPagesOf(state.page))} · newest activity first`
  } else if (state.loading) {
    text = "Loading sessions..."
  }
  return `<p class="panel-meta sessions-meta">${escapeHtml(text)}</p>`
}

/**
 * The Sessions tab's Previous and Next buttons.
 * @param {SessionsState} state
 * @returns {string}
 */
export function renderSessionsPager(state) {
  const { page } = state
  const blocked = !page || state.loading
  /**
   * @param {"previous-page" | "next-page"} action
   * @param {string} label
   * @param {boolean} disabled
   */
  const button = (action, label, disabled) =>
    `<button type="button" class="pill-button px-3 py-1.5 text-xs font-semibold" data-session-action="${action}"${disabled ? " disabled" : ""}>${label}</button>`
  return [
    button("previous-page", "Previous", blocked || page.page <= 1),
    button("next-page", "Next", blocked || page.page >= totalPagesOf(page)),
  ].join("")
}

// --- Creator colours and card bars (ticket 14) ---

/**
 * Creator rules in match order: the first whose test passes on the lower-cased
 * last path segment of a model id wins. Every slug has a
 * `--color-creator-<slug>` token.
 * @type {ReadonlyArray<{ slug: string, test: (id: string) => boolean }>}
 */
const CREATOR_RULES = [
  {
    slug: "openai",
    test: (id) =>
      id.startsWith("gpt-") || id.startsWith("codex-") || /^o\d+(-|$)/.test(id),
  },
  { slug: "anthropic", test: (id) => id.startsWith("claude-") },
  { slug: "google", test: (id) => id.startsWith("gemini-") },
  { slug: "xai", test: (id) => id.startsWith("grok-") },
  { slug: "microsoft-ai", test: (id) => id.startsWith("mai-") },
  { slug: "kimi", test: (id) => id.startsWith("kimi-") },
]

/**
 * The creator slug of a model id; `other` when no rule matches.
 * @param {string} model
 * @returns {string}
 */
export function modelCreator(model) {
  const id = model.slice(model.lastIndexOf("/") + 1).toLowerCase()
  return CREATOR_RULES.find((rule) => rule.test(id))?.slug ?? "other"
}

/**
 * The CSS colour for a model: its creator's role token.
 * @param {string} model
 * @returns {string}
 */
export function creatorColor(model) {
  return `var(--color-creator-${modelCreator(model)})`
}

/**
 * Share as a whole percent: "0%" for a non-positive whole, "<1%" for a
 * positive share under one percent, otherwise rounded.
 * @param {number} part
 * @param {number} whole
 * @returns {string}
 */
export function formatPercent(part, whole) {
  if (!(whole > 0)) return "0%"
  const share = part / whole
  if (share > 0 && share < 0.01) return "<1%"
  return `${Math.round(share * 100)}%`
}

/**
 * Left and width, as 0..1 fractions of the period, of a session's span.
 * Null when the range is missing, a bound isn't finite, or the period is empty.
 * @param {number} firstMs
 * @param {number} lastMs
 * @param {{ start_ms: number, end_ms: number } | null | undefined} range
 * @returns {{ left: number, width: number } | null}
 */
export function spanGeometry(firstMs, lastMs, range) {
  if (!range) return null
  const { start_ms: start, end_ms: end } = range
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const span = end - start
  if (!(span > 0)) return null
  const clamp = (/** @type {number} */ v, /** @type {number} */ max) =>
    Math.min(Math.max(v, 0), max)
  const left = clamp((firstMs - start) / span, 1)
  return { left, width: clamp((lastMs - firstMs) / span, 1 - left) }
}

/**
 * @param {number} fraction 0..1
 * @returns {string}
 */
function percentWidth(fraction) {
  return `${Number((fraction * 100).toFixed(4))}%`
}

/**
 * The span track: the session's first-to-last span within the period.
 * @param {TokenUsageSession} session
 * @param {{ start_ms: number, end_ms: number } | null | undefined} range
 * @returns {string}
 */
function renderSpanTrack(session, range) {
  const geometry = spanGeometry(session.first_ms, session.last_ms, range)
  const span =
    geometry ?
      `<span class="session-span" style="left:${percentWidth(geometry.left)};width:${percentWidth(geometry.width)}"></span>`
    : ""
  return `<span class="session-track">${span}</span>`
}

/**
 * @typedef {object} BarSegment
 * @property {string} label Tooltip text.
 * @property {number} fraction Width as a 0..1 share of the bar.
 * @property {string} color A CSS colour.
 */

/**
 * @param {string} className
 * @param {BarSegment[]} segments
 * @returns {string}
 */
function renderBar(className, segments) {
  const cells = segments
    .map(
      (segment) =>
        `<span data-bar-segment title="${escapeHtml(segment.label)}" style="width:${percentWidth(segment.fraction)};background:${segment.color}"></span>`,
    )
    .join("")
  return `<span class="session-bar ${className}">${cells}</span>`
}

/**
 * @param {string} className
 * @param {Array<{ color: string, name: string, figure: string, bold?: boolean }>} items
 * @returns {string}
 */
function renderLegend(className, items) {
  const entries = items
    .map((item) => {
      const figure =
        item.bold ?
          `<b>${escapeHtml(item.figure)}</b>`
        : escapeHtml(item.figure)
      return `<span class="legend-item"><span class="legend-dot" style="background:${item.color}"></span><span class="legend-name">${escapeHtml(item.name)}</span> ${figure}</span>`
    })
    .join("")
  return `<span class="session-legend ${className}">${entries}</span>`
}

/**
 * The model share bar and legend; empty when the session has no models.
 * @param {TokenUsageSession} session
 * @returns {string}
 */
function renderModelMarks(session) {
  if (session.byModel.length === 0) return ""
  const whole = session.total_tokens
  const bar = renderBar(
    "session-model-bar",
    session.byModel.map((entry) => ({
      color: creatorColor(entry.model),
      fraction: whole > 0 ? Math.max(0, entry.total_tokens / whole) : 0,
      label: `${entry.model} ${formatPercent(entry.total_tokens, whole)} of tokens`,
    })),
  )
  const legend = renderLegend(
    "session-model-legend",
    session.byModel.map((entry) => ({
      bold: true,
      color: creatorColor(entry.model),
      figure: formatInteger(entry.request_count),
      name: entry.model,
    })),
  )
  return bar + legend
}

/**
 * The token bar and legend. Segments are sized by share of the sum of the four
 * parts, so the bar fills even when `total_tokens` exceeds that sum.
 * @param {TokenUsageSession} session
 * @returns {string}
 */
function renderTokenMarks(session) {
  const parts = [
    {
      color: "var(--color-series-input)",
      label: "Input",
      short: "In",
      value: session.input_tokens,
    },
    {
      color: "var(--color-series-output)",
      label: "Output",
      short: "Out",
      value: session.output_tokens,
    },
    {
      color: "var(--color-series-cache-read)",
      label: "Cache read",
      short: "Cache R",
      value: session.cache_read_input_tokens,
    },
    {
      color: "var(--color-series-cache-write)",
      label: "Cache write",
      short: "Cache W",
      value: session.cache_creation_input_tokens,
    },
  ]
  const sum = parts.reduce((total, part) => total + part.value, 0)
  const bar = renderBar(
    "session-token-bar",
    parts.map((part) => ({
      color: part.color,
      fraction: sum > 0 ? part.value / sum : 0,
      label: `${part.label} ${formatInteger(part.value)}`,
    })),
  )
  const legend = renderLegend(
    "session-token-legend",
    parts.map((part) => ({
      color: part.color,
      figure: formatCompact(part.value),
      name: part.short,
    })),
  )
  return bar + legend
}

/**
 * One session card: a header button over an expansion region. The region is
 * empty and hidden until a session can expand.
 * @param {TokenUsageSession} session
 * @param {{ expansion?: SessionExpansion, index: number, nowMs: number, range?: { start_ms: number, end_ms: number } | null }} options `index` is the card's 0-based position on the page; `expansion` is the session's open entry, if any; `range` is the period the span track is placed within.
 * @returns {string}
 */
export function renderSessionCard(session, { expansion, index, nowMs, range }) {
  const expanded = expansion !== undefined
  const panelId = `session-panel-${index}`
  const lastActive = new Date(session.last_ms).toLocaleString()
  const day = `${formatDayLabel(session.last_ms, nowMs)} · ${formatDuration(session.last_ms - session.first_ms)}`
  const requestWord = session.request_count === 1 ? "request" : "requests"
  return `<article class="session-card" data-expanded="${expanded}">
  <button type="button" class="session-card-header" aria-expanded="${expanded}" aria-controls="${panelId}" data-session-action="toggle" data-session-key="${escapeHtml(session.key)}" data-session-sessionless="${session.sessionless}">
    <span class="session-when">
      <span class="session-clock" title="${escapeHtml(lastActive)}">${escapeHtml(formatClock(session.last_ms))}</span>
      <span class="session-age">${escapeHtml(formatAge(session.last_ms, nowMs))}</span>
      <span class="session-day">${escapeHtml(day)}</span>
      <span class="session-key">${escapeHtml(formatShortKey(session))}</span>
    </span>
    <span class="session-activity">
      <span class="session-active">Active ${escapeHtml(formatActiveRange(session.first_ms, session.last_ms, nowMs))}</span>
      ${renderSpanTrack(session, range)}
      ${renderModelMarks(session)}
    </span>
    <span class="session-tokens">
      <span class="session-tokens-total"><span class="session-figure">${escapeHtml(formatCompact(session.total_tokens))}</span> <span class="session-tokens-word">tokens</span></span>
      ${renderTokenMarks(session)}
    </span>
    <span class="session-requests">
      <span class="session-figure">${formatInteger(session.request_count)}</span>
      <span class="session-word">${requestWord}</span>
    </span>
    <span class="session-cost">
      <span class="session-figure">${formatCostList(session.costs)}</span>
      <span class="session-word">cost</span>
    </span>
    <span class="session-chevron" aria-hidden="true">▸</span>
  </button>
  <div class="session-expansion" id="${panelId}"${expanded ? "" : " hidden"}>${expanded ? renderSessionExpansion(session, expansion, { nowMs }) : ""}</div>
</article>`
}

/**
 * @typedef {object} SessionsBodyOptions
 * @property {string} eventsBody The All events body HTML, shown when All events is selected.
 * @property {number} nowMs
 * @property {(message: string) => string} renderEmptyState The viewer's empty-state renderer.
 * @property {(message: string, title?: string) => string} renderError The viewer's error panel renderer.
 */

/**
 * The Request Events tab panel: the selected tab's body. For Sessions, any list
 * error sits above whatever list is still loaded.
 * @param {SessionsState} state
 * @param {SessionsBodyOptions} options
 * @returns {string}
 */
export function renderSessionsBody(state, options) {
  const content =
    state.view === "events" ?
      options.eventsBody
    : renderSessionsList(state, options)
  return `<div role="tabpanel" id="${REQUEST_EVENTS_PANEL_ID}" aria-labelledby="${tabIdOf(state.view)}">${content}</div>`
}

/**
 * @param {SessionsState} state
 * @param {SessionsBodyOptions} options
 * @returns {string}
 */
function renderSessionsList(state, { nowMs, renderEmptyState, renderError }) {
  const error =
    state.error ?
      `<div class="p-4">${renderError(state.error, "Sessions failed")}</div>`
    : ""
  const { page } = state
  if (!page) {
    if (state.loading) return renderEmptyState("Loading sessions...")
    return error || renderEmptyState("No sessions loaded.")
  }
  const loading = `data-loading="${state.loading}"`
  if (page.items.length === 0) {
    return `${error}<div class="sessions-empty" ${loading}>${renderEmptyState("No sessions for the selected period.")}</div>`
  }
  const cards = page.items
    .map((session, index) =>
      renderSessionCard(session, {
        expansion: state.expanded[identityOf(session)],
        index,
        nowMs,
        range: page.range,
      }),
    )
    .join("")
  return `${error}<div class="sessions-list" ${loading}>${cards}</div>`
}

// --- Session expansion: lazy event rows (spec §3, §5.5, §5.11) ---

/**
 * @typedef {object} SessionEventsRequest
 * @property {"session-events"} kind
 * @property {number} requestId
 * @property {string} identity
 * @property {string} key
 * @property {boolean} sessionless
 * @property {string | null} model The model filter, or null.
 * @property {string | null} before The cursor to continue from, or null for the newest rows.
 * @property {number} limit
 * @property {"replace" | "append"} mode
 *
 * @typedef {object} SessionExpansion One open session's loaded events.
 * @property {string} key
 * @property {boolean} sessionless
 * @property {string | null} filter The model filter, or null.
 * @property {ReadonlyArray<TokenUsageSessionEventRecord>} items
 * @property {number} total
 * @property {boolean} hasMore
 * @property {string | null} nextCursor
 * @property {boolean} loading
 * @property {boolean} stale Whether the rows are the old ones still shown during a reload.
 * @property {string | null} error The last request's error message.
 * @property {number | null} requestId The latest request id; other responses are dropped.
 * @property {SessionEventsRequest | null} lastRequest The latest request, repeated by Retry.
 *
 * @typedef {{ state: SessionsState, requests: SessionEventsRequest[] }} SessionEventsTransition
 */

/**
 * Builds the session events URL from the absolute `/token-usage` URL. Sends
 * `session_id=` or `trace_id=` by `sessionless`, and omits a null `model` and `before`.
 * @param {string} tokenUsageUrl
 * @param {{ period: TokenUsagePeriod, key: string, sessionless: boolean, model: string | null, limit: number, before: string | null }} options
 * @returns {string}
 */
export function buildSessionEventsUrl(
  tokenUsageUrl,
  { before, key, limit, model, period, sessionless },
) {
  const url = appendPath(tokenUsageUrl, "session-events")
  url.searchParams.set("period", period)
  url.searchParams.set(sessionless ? "trace_id" : "session_id", key)
  if (model !== null) url.searchParams.set("model", model)
  url.searchParams.set("limit", String(limit))
  if (before !== null) url.searchParams.set("before", before)
  return url.toString()
}

/**
 * Gap since the previous event: "—" when null, else "+42s", "+3m 5s", "+1h 20m", "+2d 3h".
 * @param {number | null} gapMs
 * @returns {string}
 */
export function formatGap(gapMs) {
  if (gapMs === null) return "—"
  if (gapMs < MINUTE_MS) return `+${Math.floor(Math.max(gapMs, 0) / 1000)}s`
  if (gapMs < HOUR_MS) {
    return `+${joinUnits(`${Math.floor(gapMs / MINUTE_MS)}m`, Math.floor((gapMs % MINUTE_MS) / 1000), "s")}`
  }
  return `+${formatDuration(gapMs)}`
}

/**
 * Whether a gap is long enough to emphasise (15 minutes or more).
 * @param {number | null} gapMs
 * @returns {boolean}
 */
export function isLongGap(gapMs) {
  return gapMs !== null && gapMs >= LONG_GAP_MS
}

/**
 * Issues an events request with a fresh id and records it on the session's entry.
 * @param {SessionsState} state
 * @param {SessionExpansion} entry The entry as it should be once the request is in flight.
 * @param {{ before: string | null, mode: "replace" | "append" }} options
 * @returns {SessionEventsTransition}
 */
function requestSessionEvents(state, entry, { before, mode }) {
  const requestId = state.nextRequestId
  /** @type {SessionEventsRequest} */
  const request = {
    before,
    identity: identityOf(entry),
    key: entry.key,
    kind: "session-events",
    limit: SESSION_EVENTS_LIMIT,
    mode,
    model: entry.filter,
    requestId,
    sessionless: entry.sessionless,
  }
  return {
    requests: [request],
    state: {
      ...state,
      expanded: {
        ...state.expanded,
        [request.identity]: {
          ...entry,
          error: null,
          lastRequest: request,
          loading: true,
          requestId,
        },
      },
      nextRequestId: requestId + 1,
    },
  }
}

/**
 * Opens a collapsed session and loads its newest events; collapsing discards its entry.
 * @param {SessionsState} state
 * @param {Pick<TokenUsageSession, "key" | "sessionless">} session
 * @returns {SessionEventsTransition}
 */
export function toggleSession(state, session) {
  const identity = identityOf(session)
  if (state.expanded[identity]) {
    const { [identity]: _closed, ...rest } = state.expanded
    return { requests: [], state: { ...state, expanded: rest } }
  }
  return requestSessionEvents(
    state,
    {
      error: null,
      filter: null,
      hasMore: false,
      items: [],
      key: session.key,
      lastRequest: null,
      loading: true,
      nextCursor: null,
      requestId: null,
      sessionless: session.sessionless,
      stale: false,
      total: 0,
    },
    { before: null, mode: "replace" },
  )
}

/**
 * Loads the next older page of an open session. Does nothing while loading or at the end.
 * @param {SessionsState} state
 * @param {string} identity
 * @returns {SessionEventsTransition}
 */
export function showMoreEvents(state, identity) {
  const entry = state.expanded[identity]
  if (!entry || entry.loading || !entry.hasMore || entry.nextCursor === null) {
    return { requests: [], state }
  }
  return requestSessionEvents(state, entry, {
    before: entry.nextCursor,
    mode: "append",
  })
}

/**
 * Repeats the failed request with the same filter and cursor.
 * @param {SessionsState} state
 * @param {string} identity
 * @returns {SessionEventsTransition}
 */
export function retryEvents(state, identity) {
  const entry = state.expanded[identity]
  if (!entry || entry.loading || !entry.error || !entry.lastRequest) {
    return { requests: [], state }
  }
  const { before, mode } = entry.lastRequest
  return requestSessionEvents(state, entry, { before, mode })
}

/**
 * Applies an events response. Drops it when the session has collapsed or the
 * request isn't the session's latest.
 * @param {SessionsState} state
 * @param {{ identity: string, requestId: number, page: TokenUsageSessionEventsPage }} response
 * @returns {SessionEventsTransition}
 */
export function applySessionEvents(state, { identity, page, requestId }) {
  const entry = state.expanded[identity]
  if (!entry || entry.requestId !== requestId) return { requests: [], state }
  const append = entry.lastRequest?.mode === "append"
  return {
    requests: [],
    state: {
      ...state,
      expanded: {
        ...state.expanded,
        [identity]: {
          ...entry,
          error: null,
          hasMore: page.has_more,
          items: append ? [...entry.items, ...page.items] : page.items,
          loading: false,
          nextCursor: page.next_cursor,
          stale: false,
          total: page.total,
        },
      },
    },
  }
}

/**
 * Applies a failed events request, keeping the rows already loaded.
 * @param {SessionsState} state
 * @param {{ identity: string, requestId: number, message: string }} failure
 * @returns {SessionEventsTransition}
 */
export function applySessionEventsError(
  state,
  { identity, message, requestId },
) {
  const entry = state.expanded[identity]
  if (!entry || entry.requestId !== requestId) return { requests: [], state }
  return {
    requests: [],
    state: {
      ...state,
      expanded: {
        ...state.expanded,
        [identity]: { ...entry, error: message, loading: false },
      },
    },
  }
}

/**
 * The expansion's footer: loading, error with Retry, empty, or Show more and the count.
 * @param {SessionExpansion} entry
 * @returns {string}
 */
export function renderEventsFooter(entry) {
  const target = `data-session-key="${escapeHtml(entry.key)}" data-session-sessionless="${entry.sessionless}"`
  /** @param {string} action @param {string} label */
  const button = (action, label) =>
    `<button type="button" class="session-link-button" data-session-action="${action}" ${target}>${label}</button>`
  let content
  if (entry.loading) {
    content = "Loading events..."
  } else if (entry.error) {
    content = `<span class="session-footer-error" role="alert">${escapeHtml(entry.error)}</span> ${button("retry", "Retry")}`
  } else if (entry.total === 0) {
    content = "No events in this period."
  } else {
    const remaining = Math.min(
      SESSION_EVENTS_LIMIT,
      entry.total - entry.items.length,
    )
    const more =
      entry.hasMore ?
        `${button("more", `Show ${formatInteger(remaining)} more`)} `
      : ""
    content = `${more}Showing ${formatInteger(entry.items.length)} of ${pluralize(entry.total, "event")}`
  }
  return `<div class="session-events-footer">${content}${renderFilterChip(entry)}</div>`
}

/**
 * The events `<tbody>`: the single-model sub-header, then one row per event,
 * with day dividers in a multi-day session.
 * @param {ReadonlyArray<TokenUsageSessionEventRecord & { prev_ms?: number | null }>} items
 * @param {{ multiDay: boolean, multiModel?: boolean, nowMs: number, sessionKey?: string, sessionless?: boolean }} options `sessionKey` and `sessionless` stamp each trace button with its session, for focus restoration. `multiModel` swaps the sub-header to "Events" with blank number columns, since the breakdown above carries the labels.
 * @returns {string}
 */
export function renderEventRows(
  items,
  { multiDay, multiModel = false, nowMs, sessionKey, sessionless },
) {
  const owner =
    sessionKey === undefined ? "" : (
      ` data-session-key="${escapeHtml(sessionKey)}" data-session-sessionless="${sessionless === true}"`
    )
  const heads =
    multiModel ?
      ["Events", "Time", "Gap", "", "", "", "", "", "", "Trace"]
    : [
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
      ]
  const numeric = new Set([3, 4, 5, 6, 7, 8])
  const header = heads
    .map(
      (head, index) =>
        `<th scope="col"${numeric.has(index) ? ' class="session-num"' : ""}>${head}</th>`,
    )
    .join("")
  const rows = items.map((event, index) => {
    const divider =
      (
        multiDay
        && (index === 0
          || !isSameDay(items[index - 1].created_at_ms, event.created_at_ms))
      ) ?
        `<tr class="session-day-row"><td colspan="10"><span class="session-day-label">${escapeHtml(formatDayLabel(event.created_at_ms, nowMs))}</span></td></tr>`
      : ""
    const gapMs =
      event.prev_ms == null ? null : event.created_at_ms - event.prev_ms
    const gapClass =
      isLongGap(gapMs) ?
        "session-mono session-gap-long"
      : "session-mono session-gap"
    const trace = escapeHtml(event.trace_id)
    return `${divider}<tr class="session-event-row">
<td><span class="session-event-model"><span class="session-dot" aria-hidden="true" style="background:${creatorColor(event.model)}"></span>${escapeHtml(event.model)}</span></td>
<td class="session-mono" title="${escapeHtml(new Date(event.created_at_ms).toLocaleString())}">${escapeHtml(formatClock(event.created_at_ms, { seconds: true }))}</td>
<td class="${gapClass}">${escapeHtml(formatGap(gapMs))}</td>
<td class="session-num">${formatInteger(event.input_tokens)}</td>
<td class="session-num">${formatInteger(event.output_tokens)}</td>
<td class="session-num">${formatInteger(event.cache_read_input_tokens)}</td>
<td class="session-num">${formatInteger(event.cache_creation_input_tokens)}</td>
<td class="session-num session-total">${formatInteger(event.total_tokens)}</td>
<td class="session-num session-event-cost">${formatCostList(event.cost ? [event.cost] : null)}</td>
<td><button type="button" class="session-trace" title="Copy trace id" data-session-action="copy-trace"${owner} data-trace-id="${trace}">${trace}</button></td>
</tr>`
  })
  return `<tbody class="session-events-body"><tr class="session-events-subheader">${header}</tr>${rows.join("")}</tbody>`
}

/**
 * An open session's expansion: head line, event table and footer.
 * @param {TokenUsageSession} session
 * @param {SessionExpansion} entry
 * @param {{ nowMs: number }} options
 * @returns {string}
 */
export function renderSessionExpansion(session, entry, { nowMs }) {
  const label = session.sessionless ? "No session id · trace" : "Session"
  const multiDay = !isSameDay(session.first_ms, session.last_ms)
  const multiModel = session.byModel.length > 1
  const breakdown = renderBreakdownRows(session, entry, { nowMs })
  const rows =
    entry.items.length > 0 ?
      renderEventRows(entry.items, {
        multiDay,
        multiModel,
        nowMs,
        sessionKey: session.key,
        sessionless: session.sessionless,
      })
    : ""
  const table =
    breakdown || rows ?
      `<div class="session-events-wrap"${entry.stale ? ' data-stale="true"' : ""}><table class="session-events-table">${breakdown}${rows}</table></div>`
    : ""
  return `<div class="session-head">${label} <code class="session-full-key">${escapeHtml(session.key)}</code> <button type="button" class="session-link-button" title="Copy session key" data-session-action="copy-key" data-session-key="${escapeHtml(session.key)}" data-session-sessionless="${session.sessionless}">Copy</button> <span class="session-head-endpoints">${escapeHtml(session.endpoints.join(", "))}${multiModel ? " · click a model to filter" : ""}</span></div>${table}${renderEventsFooter(entry)}`
}

// --- Model breakdown and filter (spec §5.5, §5.10) ---

/**
 * Turns the model filter on, switches it, or (for the active model or null)
 * turns it off. The rows clear and the newest 50 reload under the new filter.
 * @param {SessionsState} state
 * @param {string} identity
 * @param {string | null} model
 * @returns {SessionEventsTransition}
 */
export function toggleModelFilter(state, identity, model) {
  const entry = state.expanded[identity]
  if (!entry) return { requests: [], state }
  const filter = model === entry.filter ? null : model
  return requestSessionEvents(
    state,
    {
      ...entry,
      filter,
      hasMore: false,
      items: [],
      nextCursor: null,
      stale: false,
      total: 0,
    },
    { before: null, mode: "replace" },
  )
}

/**
 * The filter target attributes shared by the breakdown row, its button and the footer's clear button.
 * @param {SessionExpansion} entry
 * @returns {string}
 */
function filterTarget(entry) {
  return `data-session-action="filter" data-session-key="${escapeHtml(entry.key)}" data-session-sessionless="${entry.sessionless}"`
}

/**
 * The per-model breakdown: a `<thead>` and a `<tbody>` with one row per model in
 * API order. Empty unless the session has more than one model.
 * @param {TokenUsageSession} session
 * @param {SessionExpansion} entry
 * @param {{ nowMs: number }} options
 * @returns {string}
 */
export function renderBreakdownRows(session, entry, { nowMs }) {
  if (session.byModel.length <= 1) return ""
  const heads = [
    ["Model · requests", ""],
    ["Active", ' colspan="2"'],
    ["Input", ' class="session-num"'],
    ["Output", ' class="session-num"'],
    ["Cache Read", ' class="session-num"'],
    ["Cache Write", ' class="session-num"'],
    ["Total", ' class="session-num"'],
    ["Cost", ' class="session-num"'],
    ["Share of tokens", ""],
  ]
  const header = heads
    .map(([label, attrs]) => `<th scope="col"${attrs}>${label}</th>`)
    .join("")
  const partsSum =
    session.input_tokens
    + session.output_tokens
    + session.cache_read_input_tokens
    + session.cache_creation_input_tokens
  const rows = session.byModel.map((model) => {
    const pressed = entry.filter === model.model
    const classes = [
      "session-breakdown-row",
      pressed ? "session-breakdown-pressed" : "",
      entry.filter !== null && !pressed ? "session-breakdown-dim" : "",
    ]
      .filter(Boolean)
      .join(" ")
    const name = escapeHtml(model.model)
    /** @param {string} label @param {number} value @param {string} color */
    const part = (label, value, color) => ({
      color,
      fraction: partsSum > 0 ? value / partsSum : 0,
      label: `${label} ${formatInteger(value)}`,
    })
    const bar = renderBar("session-share-bar", [
      part("Input", model.input_tokens, "var(--color-series-input)"),
      part("Output", model.output_tokens, "var(--color-series-output)"),
      part(
        "Cache read",
        model.cache_read_input_tokens,
        "var(--color-series-cache-read)",
      ),
      part(
        "Cache write",
        model.cache_creation_input_tokens,
        "var(--color-series-cache-write)",
      ),
    ])
    return `<tr class="${classes}" ${filterTarget(entry)} data-session-model="${name}">
<td><button type="button" class="session-breakdown-button" aria-pressed="${pressed}" ${filterTarget(entry)} data-session-model="${name}"><span class="session-dot" aria-hidden="true" style="background:${creatorColor(model.model)}"></span>${name}<b>${formatInteger(model.request_count)}</b></button></td>
<td class="session-breakdown-active session-mono" colspan="2">${escapeHtml(formatActiveRange(model.first_ms, model.last_ms, nowMs))}</td>
<td class="session-num">${formatInteger(model.input_tokens)}</td>
<td class="session-num">${formatInteger(model.output_tokens)}</td>
<td class="session-num">${formatInteger(model.cache_read_input_tokens)}</td>
<td class="session-num">${formatInteger(model.cache_creation_input_tokens)}</td>
<td class="session-num session-total session-breakdown-total">${formatInteger(model.total_tokens)}</td>
<td class="session-num session-event-cost session-breakdown-cost">${formatCostList(model.costs)}</td>
<td class="session-share">${bar}<span class="session-share-percent">${escapeHtml(formatPercent(model.total_tokens, session.total_tokens))}</span></td>
</tr>`
  })
  return `<thead><tr>${header}</tr></thead><tbody class="session-breakdown">${rows.join("")}</tbody>`
}

/**
 * The footer's active-filter chip: " · only ‹model› " and a "clear" button, or
 * nothing without a filter. Shown in every footer state.
 * @param {SessionExpansion} entry
 * @returns {string}
 */
function renderFilterChip(entry) {
  if (entry.filter === null) return ""
  return ` · only ${escapeHtml(entry.filter)} <button type="button" class="session-link-button" ${filterTarget(entry).replace('"filter"', '"clear-filter"')}>clear</button>`
}

// --- Focus restoration (spec §5.12) ---

const FOCUS_FIELDS = [
  "sessionAction",
  "sessionKey",
  "sessionSessionless",
  "sessionModel",
  "sessionView",
  "traceId",
]

/**
 * The attributes that identify a session control across renders, or null for an
 * element that is not one. `traceId` is included so one session's trace buttons
 * stay distinct.
 * @param {Record<string, string | undefined>} dataset a control's `dataset`
 * @returns {Record<string, string> | null}
 */
export function focusTargetOf(dataset) {
  if (dataset.sessionAction === undefined) return null
  /** @type {Record<string, string>} */
  const target = {}
  for (const field of FOCUS_FIELDS) {
    const value = dataset[field]
    if (value !== undefined) target[field] = value
  }
  return target
}

/**
 * Picks the control to focus after a render: the one whose attributes all match
 * the target, else the target session's card header, else -1 (leave focus alone).
 * The candidates must be focusable controls only. A match may be disabled; the
 * caller then keeps the target and retries on the next render.
 * @param {Record<string, string> | null} target
 * @param {ReadonlyArray<Record<string, string | undefined>>} candidateDatasets
 * @returns {number}
 */
export function chooseFocusIndex(target, candidateDatasets) {
  if (target === null) return -1
  const exact = candidateDatasets.findIndex((candidate) =>
    FOCUS_FIELDS.every((field) => candidate[field] === target[field]),
  )
  if (exact !== -1 || target.sessionKey === undefined) return exact
  return candidateDatasets.findIndex(
    (candidate) =>
      candidate.sessionAction === "toggle"
      && candidate.sessionKey === target.sessionKey
      && candidate.sessionSessionless === target.sessionSessionless,
  )
}

// --- State survival across Refresh and period change (spec §5.10, §5.5) ---

/**
 * @typedef {{ state: SessionsState, requests: Array<SessionsRequest | SessionEventsRequest> }} SessionsPageTransition
 */

/**
 * Settles the open sessions once a list page lands. A page move collapses
 * every session. A full load keeps each open session whose identity is on the
 * new page (a survivor) and reloads its newest events with one request, its old
 * rows shown as stale meanwhile; the others collapse.
 * @param {SessionsState} state The state with the landed page applied.
 * @param {TokenUsageSessionsPage} page The landed page.
 * @param {SessionsLoadReason | null} reason Why the landed load started.
 * @returns {SessionsPageTransition}
 */
function settleExpansions(state, page, reason) {
  // A page move is a deliberate move away, so it collapses everything.
  if (reason === "page") {
    return { requests: [], state: { ...state, expanded: {} } }
  }
  /** @type {SessionsState} */
  let next = { ...state, expanded: {} }
  /** @type {SessionEventsRequest[]} */
  const requests = []
  for (const session of page.items) {
    const entry = state.expanded[identityOf(session)]
    if (!entry) continue
    const reload = requestSessionEvents(
      next,
      {
        ...entry,
        filter: stillValidFilter(session, entry.filter),
        stale: true,
      },
      { before: null, mode: "replace" },
    )
    next = reload.state
    requests.push(...reload.requests)
  }
  return { requests, state: next }
}

/**
 * A survivor's filter after a reload: kept only while the reloaded card still
 * lists the model and still has more than one model, otherwise cleared.
 * @param {TokenUsageSession} session The reloaded card.
 * @param {string | null} filter
 * @returns {string | null}
 */
function stillValidFilter(session, filter) {
  const valid =
    session.byModel.length > 1
    && session.byModel.some((entry) => entry.model === filter)
  return valid ? filter : null
}
