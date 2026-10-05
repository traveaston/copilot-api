// @ts-check

/** @typedef {import("~/lib/token-usage").TokenUsagePeriod} TokenUsagePeriod */
/** @typedef {"sessions" | "events"} SessionsView */
/** @typedef {import("~/lib/token-usage").TokenUsageSession} TokenUsageSession */
/** @typedef {import("~/lib/token-usage").TokenUsageCost} TokenUsageCost */
/** @typedef {import("~/lib/token-usage").TokenUsageSessionsPage} TokenUsageSessionsPage */

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
 * Applies a sessions page response. Drops a stale response, and re-fetches a
 * page past the end once per load.
 * @param {SessionsState} state
 * @param {{ requestId: number, page: TokenUsageSessionsPage }} response
 * @returns {SessionsTransition}
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
  return {
    requests: [],
    state: {
      ...state,
      available: true,
      loading: false,
      page,
      reason: null,
    },
  }
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

/**
 * One session card: a header button over an expansion region. The region is
 * empty and hidden until a session can expand.
 * @param {TokenUsageSession} session
 * @param {{ index: number, nowMs: number }} options `index` is the card's 0-based position on the page.
 * @returns {string}
 */
export function renderSessionCard(session, { index, nowMs }) {
  const panelId = `session-panel-${index}`
  const lastActive = new Date(session.last_ms).toLocaleString()
  const day = `${formatDayLabel(session.last_ms, nowMs)} · ${formatDuration(session.last_ms - session.first_ms)}`
  const requestWord = session.request_count === 1 ? "request" : "requests"
  return `<article class="session-card" data-expanded="false">
  <button type="button" class="session-card-header" aria-expanded="false" aria-controls="${panelId}" data-session-action="toggle" data-session-key="${escapeHtml(session.key)}" data-session-sessionless="${session.sessionless}">
    <span class="session-when">
      <span class="session-clock" title="${escapeHtml(lastActive)}">${escapeHtml(formatClock(session.last_ms))}</span>
      <span class="session-age">${escapeHtml(formatAge(session.last_ms, nowMs))}</span>
      <span class="session-day">${escapeHtml(day)}</span>
      <span class="session-key">${escapeHtml(formatShortKey(session))}</span>
    </span>
    <span class="session-activity">
      <span class="session-active">Active ${escapeHtml(formatActiveRange(session.first_ms, session.last_ms, nowMs))}</span>
    </span>
    <span class="session-tokens">
      <span class="session-figure">${escapeHtml(formatCompact(session.total_tokens))}</span> <span class="session-tokens-word">tokens</span>
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
  <div class="session-expansion" id="${panelId}" hidden></div>
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
    .map((session, index) => renderSessionCard(session, { index, nowMs }))
    .join("")
  return `${error}<div class="sessions-list" ${loading}>${cards}</div>`
}
