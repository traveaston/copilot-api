// @ts-check

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
