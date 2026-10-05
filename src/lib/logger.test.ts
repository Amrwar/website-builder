import { describe, expect, it, vi } from "vitest";

import { REDACTED, createLogger, redact, type LogRecord } from "./logger";

function capture(
  level: Parameters<typeof createLogger>[0] extends undefined ? never : "debug",
) {
  const records: LogRecord[] = [];
  const logger = createLogger({
    level,
    pretty: false,
    sink: (record) => records.push(record),
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  return { logger, records };
}

describe("redact", () => {
  it("removes values whose key looks sensitive", () => {
    const result = redact({
      email: "a@b.test",
      password: "hunter2",
      apiKey: "sk_live_abc",
      authorization: "Bearer xyz",
      sessionToken: "s3cret",
    }) as Record<string, unknown>;

    expect(result.email).toBe("a@b.test");
    expect(result.password).toBe(REDACTED);
    expect(result.apiKey).toBe(REDACTED);
    expect(result.authorization).toBe(REDACTED);
    expect(result.sessionToken).toBe(REDACTED);
  });

  it("redacts nested values", () => {
    const result = redact({ db: { url: "x", databasePassword: "p" } }) as {
      db: Record<string, unknown>;
    };
    expect(result.db.databasePassword).toBe(REDACTED);
  });

  it("survives circular references instead of throwing", () => {
    // A logging call must never be the thing that takes a request down.
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic.self = cyclic;

    expect(() => redact(cyclic)).not.toThrow();
    expect((redact(cyclic) as Record<string, unknown>).self).toBe("[circular]");
  });

  it("truncates long strings", () => {
    const result = redact("x".repeat(900)) as string;
    expect(result.length).toBeLessThan(900);
    expect(result).toContain("truncated");
  });

  it("serialises errors with their stack and cause", () => {
    const error = new Error("outer", { cause: new Error("inner") });
    const result = redact(error) as Record<string, unknown>;

    expect(result.name).toBe("Error");
    expect(result.message).toBe("outer");
    expect(result.stack).toBeTruthy();
    expect((result.cause as Record<string, unknown>).message).toBe("inner");
  });

  it("stops at a depth limit rather than recursing forever", () => {
    let deep: Record<string, unknown> = { value: "bottom" };
    for (let i = 0; i < 20; i += 1) deep = { nested: deep };

    expect(() => redact(deep)).not.toThrow();
    expect(JSON.stringify(redact(deep))).toContain("max depth");
  });
});

describe("createLogger", () => {
  it("writes a structured record", () => {
    const { logger, records } = capture("debug");
    logger.info("project created", { projectId: "p_1" });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: "info",
      message: "project created",
      timestamp: "2026-01-01T00:00:00.000Z",
      context: { projectId: "p_1" },
    });
  });

  it("drops records below the configured level", () => {
    const records: LogRecord[] = [];
    const logger = createLogger({
      level: "warn",
      pretty: false,
      sink: (record) => records.push(record),
    });

    logger.debug("nope");
    logger.info("nope");
    logger.warn("yes");
    logger.error("yes");

    expect(records.map((r) => r.level)).toEqual(["warn", "error"]);
  });

  it("redacts context before it reaches the sink", () => {
    const { logger, records } = capture("debug");
    logger.error("stripe call failed", { apiKey: "sk_live_x" });

    expect(records[0]?.context?.apiKey).toBe(REDACTED);
  });

  it("merges bound fields from child loggers", () => {
    const { logger, records } = capture("debug");
    logger.child({ requestId: "r_1" }).child({ projectId: "p_1" }).info("ok");

    expect(records[0]?.context).toMatchObject({ requestId: "r_1", projectId: "p_1" });
  });

  it("lets a call-site field override a bound one", () => {
    const { logger, records } = capture("debug");
    logger.child({ stage: "build" }).info("moved", { stage: "preview" });

    expect(records[0]?.context?.stage).toBe("preview");
  });

  it("emits single-line JSON when not pretty", () => {
    const written: string[] = [];
    const logger = createLogger({
      level: "debug",
      pretty: false,
      sink: (_record, formatted) => written.push(formatted),
    });

    logger.info("deployed", { region: "iad1" });

    expect(written[0]).toBeDefined();
    expect(written[0]!.includes("\n")).toBe(false);
    expect(JSON.parse(written[0]!)).toMatchObject({ message: "deployed" });
  });

  it("routes errors to stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    createLogger({ level: "debug" }).error("boom");

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
