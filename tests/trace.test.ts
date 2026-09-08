import { describe, expect, test } from "bun:test"
import consola from "consola"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"

import { requestContext, setRequestSessionId } from "~/lib/request-context"
import {
  formatErrorContext,
  installConsolaErrorContext,
  restoreConsolaErrorContext,
  traceIdMiddleware,
} from "~/lib/trace"

const createTracingApp = () => {
  const app = new Hono()

  app.use(traceIdMiddleware)

  app.get("/trace", (c) => {
    const store = requestContext.getStore()
    const traceId = store?.traceId ?? null
    const sessionId = store?.sessionId ?? null
    return c.json({ traceId, sessionId })
  })

  app.get("/trace-stream", (c) => {
    return streamSSE(c, async (stream) => {
      const traceId = requestContext.getStore()?.traceId ?? null

      await stream.writeSSE({
        event: "trace",
        data: JSON.stringify({ traceId }),
      })
    })
  })

  return app
}

describe("formatErrorContext", () => {
  test("returns null when store is missing or empty", () => {
    expect(formatErrorContext(null)).toBeNull()
    expect(formatErrorContext(undefined)).toBeNull()
    expect(formatErrorContext({})).toBeNull()
    expect(formatErrorContext({ traceId: "  ", sessionId: "" })).toBeNull()
  })

  test("formats trace only when sessionId is not present", () => {
    expect(formatErrorContext({ traceId: "trace-123" })).toBe(
      "[trace: trace-123]",
    )
    expect(
      formatErrorContext({ traceId: "  trace-123  ", sessionId: "  " }),
    ).toBe("[trace: trace-123]")
  })

  test("formats session only when traceId is not present", () => {
    expect(formatErrorContext({ sessionId: "sess-abc" })).toBe(
      "[session: sess-abc]",
    )
    expect(formatErrorContext({ traceId: " ", sessionId: " sess-abc " })).toBe(
      "[session: sess-abc]",
    )
  })

  test("formats both trace and session when present", () => {
    expect(
      formatErrorContext({ traceId: "trace-123", sessionId: "sess-abc" }),
    ).toBe("[trace: trace-123, session: sess-abc]")
  })
})

describe("requestContext session handling", () => {
  test("sets sessionId on the active request store", () => {
    expect(() => setRequestSessionId("outside-context")).not.toThrow()

    requestContext.run(
      {
        traceId: "trace-ctx",
        startTime: Date.now(),
        userAgent: "test",
        sessionAffinity: undefined,
        parentSessionId: undefined,
      },
      () => {
        expect(requestContext.getStore()?.sessionId).toBeUndefined()

        setRequestSessionId(" session-xyz ")
        expect(requestContext.getStore()?.sessionId).toBe("session-xyz")

        setRequestSessionId("   ")
        expect(requestContext.getStore()?.sessionId).toBe("session-xyz")
      },
    )
  })
})

describe("consola error context interception", () => {
  test("prepends context prefix to error and fatal logs during request execution", () => {
    installConsolaErrorContext()

    const prevLevel = consola.level
    consola.level = 5
    const captured: Array<{ type: string; args: Array<unknown> }> = []
    const reporter = {
      log(logObj: { type: string; args: Array<unknown> }) {
        captured.push({ type: logObj.type, args: [...logObj.args] })
      },
    }
    consola.addReporter(reporter)

    try {
      requestContext.run(
        {
          traceId: "req-trace-1",
          sessionId: "req-sess-1",
          startTime: Date.now(),
          userAgent: "test-agent",
          sessionAffinity: undefined,
          parentSessionId: undefined,
        },
        () => {
          consola.error("Something went wrong", { detail: "error detail" })
          consola.fatal("Fatal failure")
          consola.warn("Warning message")
          consola.info("Informational message")
        },
      )

      expect(captured).toHaveLength(4)

      expect(captured[0].type).toBe("error")
      expect(captured[0].args[0]).toBe(
        "[trace: req-trace-1, session: req-sess-1]",
      )
      expect(captured[0].args[1]).toBe("Something went wrong")
      expect(captured[0].args[2]).toEqual({ detail: "error detail" })

      expect(captured[1].type).toBe("fatal")
      expect(captured[1].args[0]).toBe(
        "[trace: req-trace-1, session: req-sess-1]",
      )
      expect(captured[1].args[1]).toBe("Fatal failure")

      expect(captured[2].type).toBe("warn")
      expect(captured[2].args[0]).toBe("Warning message")

      expect(captured[3].type).toBe("info")
      expect(captured[3].args[0]).toBe("Informational message")
    } finally {
      consola.removeReporter(reporter)
      consola.level = prevLevel
    }
  })

  test("prepends trace-only or session-only context prefix when only one is present", () => {
    installConsolaErrorContext()

    const captured: Array<{ type: string; args: Array<unknown> }> = []
    const reporter = {
      log(logObj: { type: string; args: Array<unknown> }) {
        captured.push({ type: logObj.type, args: [...logObj.args] })
      },
    }
    consola.addReporter(reporter)

    try {
      requestContext.run(
        {
          traceId: "trace-only-id",
          startTime: Date.now(),
          userAgent: "test-agent",
          sessionAffinity: undefined,
          parentSessionId: undefined,
        },
        () => {
          consola.error("Trace only error")
        },
      )

      requestContext.run(
        {
          traceId: "",
          sessionId: "session-only-id",
          startTime: Date.now(),
          userAgent: "test-agent",
          sessionAffinity: undefined,
          parentSessionId: undefined,
        },
        () => {
          consola.error("Session only error")
        },
      )

      expect(captured).toHaveLength(2)
      expect(captured[0].args[0]).toBe("[trace: trace-only-id]")
      expect(captured[0].args[1]).toBe("Trace only error")
      expect(captured[1].args[0]).toBe("[session: session-only-id]")
      expect(captured[1].args[1]).toBe("Session only error")
    } finally {
      consola.removeReporter(reporter)
    }
  })

  test("restoreConsolaErrorContext removes the prefix hook", () => {
    installConsolaErrorContext()
    restoreConsolaErrorContext()

    const captured: Array<{ type: string; args: Array<unknown> }> = []
    const reporter = {
      log(logObj: { type: string; args: Array<unknown> }) {
        captured.push({ type: logObj.type, args: [...logObj.args] })
      },
    }
    consola.addReporter(reporter)

    try {
      requestContext.run(
        {
          traceId: "restored-trace",
          sessionId: "restored-session",
          startTime: Date.now(),
          userAgent: "test-agent",
          sessionAffinity: undefined,
          parentSessionId: undefined,
        },
        () => {
          consola.error("Message without hook")
        },
      )

      expect(captured).toHaveLength(1)
      expect(captured[0].args[0]).toBe("Message without hook")
    } finally {
      consola.removeReporter(reporter)
      installConsolaErrorContext()
    }
  })

  test("does not add prefix when logging outside an active request context", () => {
    installConsolaErrorContext()

    const captured: Array<{ type: string; args: Array<unknown> }> = []
    const reporter = {
      log(logObj: { type: string; args: Array<unknown> }) {
        captured.push({ type: logObj.type, args: [...logObj.args] })
      },
    }
    consola.addReporter(reporter)

    try {
      consola.error("Standalone error outside context")
      expect(captured).toHaveLength(1)
      expect(captured[0].args[0]).toBe("Standalone error outside context")
    } finally {
      consola.removeReporter(reporter)
    }
  })
})

describe("traceIdMiddleware", () => {
  test("sanitizes a valid client trace id and exposes it via request context", async () => {
    const app = createTracingApp()

    const response = await app.request("/trace", {
      headers: {
        "x-trace-id": "  trace-123_ABC  ",
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("x-trace-id")).toBe("trace-123_ABC")
    expect(await response.json()).toEqual({
      traceId: "trace-123_ABC",
      sessionId: null,
    })
  })

  test("extracts x-session-id or session-id header", async () => {
    const app = createTracingApp()

    const res1 = await app.request("/trace", {
      headers: {
        "x-session-id": "sess-from-x",
      },
    })
    expect(res1.status).toBe(200)
    expect(await res1.json()).toMatchObject({
      sessionId: "sess-from-x",
    })

    const res2 = await app.request("/trace", {
      headers: {
        "session-id": "sess-from-standard",
      },
    })
    expect(res2.status).toBe(200)
    expect(await res2.json()).toMatchObject({
      sessionId: "sess-from-standard",
    })
  })

  test("falls back to a generated trace id for invalid input and preserves it in SSE", async () => {
    const app = createTracingApp()

    const response = await app.request("/trace-stream", {
      headers: {
        "x-trace-id": "bad trace value",
      },
    })

    expect(response.status).toBe(200)

    const traceId = response.headers.get("x-trace-id")

    expect(traceId).not.toBeNull()

    if (!traceId) {
      throw new Error("Expected x-trace-id response header")
    }

    expect(traceId).not.toBe("bad trace value")
    expect(traceId).toMatch(/^\w[\w.-]*$/)

    const body = await response.text()

    expect(body).toContain("event: trace")
    expect(body).toContain(`"traceId":"${traceId}"`)
  })
})
