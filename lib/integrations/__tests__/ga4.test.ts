import { describe, expect, it, vi } from "vitest";
import { Ga4IntegrationError, readGa4Report } from "../ga4";

const credentials = JSON.stringify({
  type: "service_account",
  client_email: "synthetic@example.invalid",
  private_key: "synthetic-not-a-key",
});
const validInput = {
  property: "123456",
  start: "2026-01-01",
  end: "2026-01-03",
  serviceAccountJson: credentials,
  allowedPropertyIds: ["123456"],
};

describe("readGa4Report (synthetic offline fixtures)", () => {
  it("exposes status on typed errors for the route adapter", () => {
    const error = new Ga4IntegrationError("RATE_LIMITED", 429, "GA4 rate limit exceeded");
    expect(error.status).toBe(429);
  });

  it("rejects malformed and non-allowlisted properties before auth or transport", async () => {
    const getAccessToken = vi.fn(async () => "synthetic-token");
    const fetchImpl = vi.fn(async () => new Response("{}"));

    for (const property of ["properties/123456", "123abc", "", "0", " 123456 "]) {
      await expect(readGa4Report({ ...validInput, property, getAccessToken, fetchImpl })).rejects.toMatchObject({
        code: "INVALID_INPUT",
        statusCode: 400,
      });
    }
    await expect(readGa4Report({ ...validInput, allowedPropertyIds: [], getAccessToken, fetchImpl })).rejects.toMatchObject({
      code: "FORBIDDEN",
      statusCode: 403,
    });
    await expect(readGa4Report({ ...validInput, allowedPropertyIds: ["999"], getAccessToken, fetchImpl })).rejects.toBeInstanceOf(Ga4IntegrationError);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects invalid date ranges and missing credentials before auth or transport", async () => {
    const getAccessToken = vi.fn(async () => "synthetic-token");
    const fetchImpl = vi.fn(async () => new Response("{}"));
    for (const [start, end] of [
      ["2026-02-30", "2026-03-01"],
      ["2026-13-01", "2026-03-01"],
      ["2026-1-01", "2026-03-01"],
      ["2026-03-02", "2026-03-01"],
      ["2024-01-01", "2026-01-01"],
    ]) {
      await expect(readGa4Report({ ...validInput, start, end, getAccessToken, fetchImpl })).rejects.toMatchObject({
        code: "INVALID_INPUT", statusCode: 400,
      });
    }
    await expect(readGa4Report({ ...validInput, serviceAccountJson: "", getAccessToken, fetchImpl })).rejects.toMatchObject({
      code: "NOT_CONFIGURED", statusCode: 503,
    });
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs a read-only report with bearer auth, normalizes rows, and pages until rowCount", async () => {
    const getAccessToken = vi.fn(async () => "synthetic-token");
    const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ rowCount: 2, rows: [{
        dimensionValues: [{ value: requests.length === 1 ? "20260101" : "20260102" }, { value: "Organic Search" }],
        metricValues: [{ value: "12" }, { value: "10" }, { value: "45" }],
      }] }), { status: 200 });
    });
    const result = await readGa4Report({ ...validInput, getAccessToken, fetchImpl });
    expect(result).toMatchObject({
      provider: "ga4", scope: { property: "123456" }, dateRange: { start: "2026-01-01", end: "2026-01-03" },
      status: "succeeded", warnings: [],
      rows: [
        { date: "2026-01-01", sessionDefaultChannelGroup: "Organic Search", sessions: 12, activeUsers: 10, eventCount: 45 },
        { date: "2026-01-02", sessionDefaultChannelGroup: "Organic Search", sessions: 12, activeUsers: 10, eventCount: 45 },
      ],
      metadata: { rowCount: 2, fetchedRows: 2, truncated: false },
    });
    expect(new Date(result.collectedAt).toISOString()).toBe(result.collectedAt);
    expect(requests).toHaveLength(2);
    expect(requests.map((r) => r.body.offset)).toEqual(["0", "1"]);
    for (const request of requests) {
      expect(request.url).toBe("https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport");
      expect(request.headers.get("Authorization")).toBe("Bearer synthetic-token");
      expect(request.body).toMatchObject({
        dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "eventCount" }],
        dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-03" }], limit: "10000",
      });
      expect(JSON.stringify(request.body)).not.toContain("synthetic-token");
      expect(request.url).not.toContain("synthetic-token");
    }
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("rejects impossible upstream dates instead of returning fabricated normalized dates", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      rowCount: 1,
      rows: [{ dimensionValues: [{ value: "20260230" }, { value: "Direct" }], metricValues: [{ value: "1" }, { value: "1" }, { value: "1" }] }],
    })));
    await expect(readGa4Report({ ...validInput, getAccessToken: async () => "synthetic-token", fetchImpl })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR", statusCode: 502,
    });
  });

  it("maps 429 and upstream failures to typed errors without exposing bodies or tokens", async () => {
    const secret = "synthetic-secret-do-not-expose";
    for (const status of [429, 500]) {
      const fetchImpl = vi.fn(async () => new Response(`upstream token=${secret}`, { status }));
      const error = await readGa4Report({ ...validInput, getAccessToken: async () => secret, fetchImpl }).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Ga4IntegrationError);
      if (!(error instanceof Ga4IntegrationError)) throw new Error("Expected GA4 integration error");
      expect(error).toMatchObject({ status: status === 429 ? 429 : 502, code: status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR" });
      expect(JSON.stringify({ message: error.message, code: error.code })).not.toContain(secret);
      expect(JSON.stringify({ message: error.message, code: error.code })).not.toContain("upstream token=");
    }
  });

  it("rejects upstream rows outside the requested date range", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      rowCount: 1,
      rows: [{ dimensionValues: [{ value: "20251231" }, { value: "Direct" }], metricValues: [{ value: "1" }, { value: "1" }, { value: "1" }] }],
    })));
    await expect(readGa4Report({ ...validInput, getAccessToken: async () => "synthetic-token", fetchImpl })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR", statusCode: 502,
    });
  });

  it("accepts zero-row reports with omitted rows array", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ rowCount: 0 })));
    await expect(readGa4Report({ ...validInput, getAccessToken: async () => "synthetic-token", fetchImpl })).resolves.toMatchObject({
      rows: [], status: "succeeded", metadata: { rowCount: 0, fetchedRows: 0, truncated: false },
    });
  });

  it("rejects missing numeric metrics rather than inventing zeros", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      rowCount: 1,
      rows: [{ dimensionValues: [{ value: "20260101" }, { value: "Direct" }], metricValues: [{ value: "1" }, { value: "1" }] }],
    })));
    await expect(readGa4Report({ ...validInput, getAccessToken: async () => "synthetic-token", fetchImpl })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR", statusCode: 502,
    });
  });

  it("marks a bounded report partial when the upstream rowCount exceeds fetched rows", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      rowCount: 100_001,
      rows: [{ dimensionValues: [{ value: "20260101" }, { value: "Direct" }], metricValues: [{ value: "1" }, { value: "1" }, { value: "1" }] }],
    })));
    const report = await readGa4Report({ ...validInput, getAccessToken: async () => "synthetic-token", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    expect(report.status).toBe("partial");
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.metadata).toEqual({ rowCount: 100_001, fetchedRows: 10, truncated: true });
  });
});
