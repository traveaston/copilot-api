import consola, {
  LogLevels,
  type ConsolaInstance,
  type ConsolaReporter,
} from "consola"
import type { MiddlewareHandler } from "hono"

import {
  requestContext,
  resolveTraceId,
  type RequestContext,
} from "./request-context"

export function formatErrorContext(
  store: Pick<RequestContext, "traceId" | "sessionId"> | undefined,
): string | undefined {
  const parts: Array<string> = []
  if (store?.traceId) parts.push(`trace: ${store.traceId}`)
  if (store?.sessionId) parts.push(`session: ${store.sessionId}`)
  return parts.length > 0 ? `[${parts.join(", ")}]` : undefined
}

const withErrorContext = (reporter: ConsolaReporter): ConsolaReporter => ({
  log(logObj, ctx) {
    const prefix =
      logObj.level <= LogLevels.error ?
        formatErrorContext(requestContext.getStore())
      : undefined
    reporter.log(
      prefix ?
        { ...logObj, args: [prefix, ...(logObj.args as Array<unknown>)] }
      : logObj,
      ctx,
    )
  },
})

const instancesWithErrorContext = new WeakSet<ConsolaInstance>()

// Prefix error and fatal output with the active request's trace and session
// ids, so a console error can be matched to its handler log lines.
export function installConsolaErrorContext(
  instance: ConsolaInstance = consola,
): void {
  if (instancesWithErrorContext.has(instance)) return
  instancesWithErrorContext.add(instance)
  instance.setReporters(instance.options.reporters.map(withErrorContext))
}

export const traceIdMiddleware: MiddlewareHandler = async (c, next) => {
  const traceId = resolveTraceId(c.req.header("x-trace-id"))

  c.header("x-trace-id", traceId)

  const context = {
    traceId,
    startTime: Date.now(),
    userAgent: c.req.header("user-agent") || "",
    sessionAffinity:
      c.req.header("x-session-affinity") ?? c.req.header("x-client-request-id"),
    parentSessionId: c.req.header("x-parent-session-id"),
  }

  await requestContext.run(context, async () => {
    await next()
  })
}
