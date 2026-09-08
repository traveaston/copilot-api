import consola from "consola"
import type { MiddlewareHandler } from "hono"

import {
  requestContext,
  resolveTraceId,
  type RequestContext,
} from "./request-context"

const CONTEXT_PREFIXED = Symbol("context_prefixed")

export function formatErrorContext(
  store?: { traceId?: string | null; sessionId?: string | null } | null,
): string | null {
  if (!store) return null

  const parts: Array<string> = []
  const traceId = store.traceId?.trim()
  const sessionId = store.sessionId?.trim()

  if (traceId) {
    parts.push(`trace: ${traceId}`)
  }
  if (sessionId) {
    parts.push(`session: ${sessionId}`)
  }

  return parts.length > 0 ? `[${parts.join(", ")}]` : null
}

let consolaErrorContextInstalled = false
const originalConsolaLog = consola._log.bind(consola)

export function installConsolaErrorContext(): void {
  if (consolaErrorContextInstalled) return
  consolaErrorContextInstalled = true

  consola._log = function (logObj) {
    if (
      !(logObj as unknown as Record<symbol, unknown>)[CONTEXT_PREFIXED]
      && (logObj.type === "error"
        || logObj.type === "fatal"
        || (typeof logObj.level === "number" && logObj.level <= 0))
    ) {
      ;(logObj as unknown as Record<symbol, unknown>)[CONTEXT_PREFIXED] = true
      const store = requestContext.getStore()
      const prefix = formatErrorContext(store)
      if (prefix) {
        logObj.args.unshift(prefix)
      }
    }
    return originalConsolaLog(logObj)
  }
}

export function restoreConsolaErrorContext(): void {
  consola._log = originalConsolaLog
  consolaErrorContextInstalled = false
}

installConsolaErrorContext()

export const traceIdMiddleware: MiddlewareHandler = async (c, next) => {
  const traceId = resolveTraceId(c.req.header("x-trace-id"))

  c.header("x-trace-id", traceId)

  const rawSessionId =
    c.req.header("x-session-id")?.trim()
    || c.req.header("session-id")?.trim()
    || undefined

  const context: RequestContext = {
    traceId,
    startTime: Date.now(),
    userAgent: c.req.header("user-agent") || "",
    sessionAffinity:
      c.req.header("x-session-affinity") ?? c.req.header("x-client-request-id"),
    parentSessionId: c.req.header("x-parent-session-id"),
    sessionId: rawSessionId,
  }

  await requestContext.run(context, async () => {
    await next()
  })
}
