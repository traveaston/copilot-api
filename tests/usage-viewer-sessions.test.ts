import { describe, expect, test } from "bun:test"

import {
  CURRENCY_SYMBOLS,
  LONG_GAP_MS,
  SESSION_EVENTS_LIMIT,
  SESSIONS_PAGE_SIZE,
  escapeHtml,
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
