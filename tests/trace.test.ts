import { describe, expect, test } from "bun:test"
import consola, { type LogObject } from "consola"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"

import {
  requestContext,
  setRequestSessionId,
  type RequestContext,
} from "~/lib/request-context"
import {
  formatErrorContext,
  installConsolaErrorContext,
  traceIdMiddleware,
} from "~/lib/trace"

const createTracingApp = () => {
  const app = new Hono()

  app.use(traceIdMiddleware)

  app.get("/trace", (c) => {
    const traceId = requestContext.getStore()?.traceId ?? null
    return c.json({ traceId })
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

const requestStore = (overrides: Partial<RequestContext> = {}) => ({
  traceId: "req-trace-1",
  startTime: Date.now(),
  userAgent: "test-agent",
  sessionAffinity: undefined,
  parentSessionId: undefined,
  ...overrides,
})

const createCapturingConsola = () => {
  const captured: Array<Pick<LogObject, "type" | "args">> = []
  const instance = consola.create({
    level: 5,
    reporters: [
      {
        log: (logObj) => {
          captured.push({ type: logObj.type, args: logObj.args })
        },
      },
    ],
  })
  installConsolaErrorContext(instance)
  return { instance, captured }
}

describe("formatErrorContext", () => {
  test("returns undefined without a trace id", () => {
    expect(formatErrorContext(undefined)).toBeUndefined()
    expect(formatErrorContext({ traceId: "" })).toBeUndefined()
  })

  test("formats the trace id", () => {
    expect(formatErrorContext({ traceId: "trace-123" })).toBe(
      "[trace: trace-123]",
    )
  })

  test("adds the session id when present", () => {
    expect(
      formatErrorContext({ traceId: "trace-123", sessionId: "sess-abc" }),
    ).toBe("[trace: trace-123, session: sess-abc]")
    expect(formatErrorContext({ traceId: "", sessionId: "sess-abc" })).toBe(
      "[session: sess-abc]",
    )
  })
})

describe("setRequestSessionId", () => {
  test("sets the session id on the active request only", () => {
    expect(() => setRequestSessionId("outside-request")).not.toThrow()

    requestContext.run(requestStore(), () => {
      setRequestSessionId(undefined)
      expect(requestContext.getStore()?.sessionId).toBeUndefined()

      setRequestSessionId("session-xyz")
      expect(requestContext.getStore()?.sessionId).toBe("session-xyz")
    })
  })
})

describe("installConsolaErrorContext", () => {
  test("prefixes error and fatal logs inside a request", () => {
    const { instance, captured } = createCapturingConsola()

    requestContext.run(requestStore(), () => {
      instance.error("Something went wrong", { detail: "error detail" })
      instance.fatal("Fatal failure")
      instance.warn("Warning message")
      instance.info("Informational message")
    })

    expect(captured).toEqual([
      {
        type: "error",
        args: [
          "[trace: req-trace-1]",
          "Something went wrong",
          { detail: "error detail" },
        ],
      },
      { type: "fatal", args: ["[trace: req-trace-1]", "Fatal failure"] },
      { type: "warn", args: ["Warning message"] },
      { type: "info", args: ["Informational message"] },
    ])
  })

  test("leaves errors outside a request unprefixed", () => {
    const { instance, captured } = createCapturingConsola()

    instance.error("Standalone error")

    expect(captured).toEqual([{ type: "error", args: ["Standalone error"] }])
  })

  test("prefixes once when installed twice", () => {
    const { instance, captured } = createCapturingConsola()
    installConsolaErrorContext(instance)

    requestContext.run(requestStore(), () => {
      instance.error("Once")
    })

    expect(captured[0].args).toEqual(["[trace: req-trace-1]", "Once"])
  })

  test("includes the session id once a handler sets it", () => {
    const { instance, captured } = createCapturingConsola()

    requestContext.run(requestStore(), () => {
      setRequestSessionId("req-sess-1")
      instance.error("With session")
    })

    expect(captured[0].args).toEqual([
      "[trace: req-trace-1, session: req-sess-1]",
      "With session",
    ])
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
    expect(await response.json()).toEqual({ traceId: "trace-123_ABC" })
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
