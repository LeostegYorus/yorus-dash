export type Ga4ErrorCode = "INVALID_INPUT" | "FORBIDDEN" | "NOT_CONFIGURED" | "UPSTREAM_ERROR" | "RATE_LIMITED";

export class Ga4IntegrationError extends Error {
  constructor(
    public readonly code: Ga4ErrorCode,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "Ga4IntegrationError";
  }

  get status(): number {
    return this.statusCode;
  }
}

export interface Ga4ReportInput {
  property: string;
  start: string;
  end: string;
  serviceAccountJson: string;
  allowedPropertyIds: readonly string[];
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
}

export interface Ga4Row {
  date: string;
  sessionDefaultChannelGroup: string;
  sessions: number;
  activeUsers: number;
  eventCount: number;
}

export interface Ga4Report {
  provider: "ga4";
  scope: { property: string };
  dateRange: { start: string; end: string };
  collectedAt: string;
  rows: Ga4Row[];
  warnings: string[];
  status: "succeeded" | "partial";
  metadata: { rowCount: number; fetchedRows: number; truncated: boolean };
}

export async function readGa4Report(input: Ga4ReportInput): Promise<Ga4Report> {
  if (typeof input.property !== "string" || !/^[1-9][0-9]*$/.test(input.property)) {
    throw new Ga4IntegrationError("INVALID_INPUT", 400, "Invalid GA4 property ID");
  }
  if (!Array.isArray(input.allowedPropertyIds) || !input.allowedPropertyIds.includes(input.property)) {
    throw new Ga4IntegrationError("FORBIDDEN", 403, "GA4 property is not allowed");
  }
  const parseDay = (day: string): number => {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
    const timestamp = Date.parse(`${day}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day ? timestamp : NaN;
  };
  const from = parseDay(input.start);
  const to = parseDay(input.end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || to - from > 366 * 86400000) {
    throw new Ga4IntegrationError("INVALID_INPUT", 400, "Invalid GA4 date range");
  }
  if (typeof input.serviceAccountJson !== "string" || !input.serviceAccountJson.trim()) {
    throw new Ga4IntegrationError("NOT_CONFIGURED", 503, "GA4 credentials are not configured");
  }
  const getToken = input.getAccessToken ?? (async () => {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(input.serviceAccountJson) as Record<string, unknown>;
      if (credentials.type !== "service_account" || typeof credentials.client_email !== "string" || typeof credentials.private_key !== "string") {
        throw new Error("Invalid credentials");
      }
    } catch {
      throw new Ga4IntegrationError("NOT_CONFIGURED", 503, "GA4 credentials are invalid");
    }
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
    const token = await auth.getAccessToken();
    if (!token) throw new Error("Empty access token");
    return token;
  });
  let token: string;
  try {
    token = await getToken();
    if (!token) throw new Error("Empty access token");
  } catch (error) {
    if (error instanceof Ga4IntegrationError) throw error;
    throw new Ga4IntegrationError("UPSTREAM_ERROR", 502, "GA4 authentication failed");
  }
  const rows: Ga4Row[] = [];
  let rowCount = 0;
  const PAGE_SIZE = 10_000;
  const MAX_PAGES = 10;
  for (let page = 0; page < MAX_PAGES; page++) {
    let response: Response;
    try {
      response = await (input.fetchImpl ?? fetch)(
        `https://analyticsdata.googleapis.com/v1beta/properties/${input.property}:runReport`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            dateRanges: [{ startDate: input.start, endDate: input.end }],
            dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
            metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "eventCount" }],
            limit: String(PAGE_SIZE), offset: String(rows.length),
          }),
        },
      );
    } catch {
      throw new Ga4IntegrationError("UPSTREAM_ERROR", 502, "GA4 request failed");
    }
    if (!response.ok) {
      if (response.status === 429) throw new Ga4IntegrationError("RATE_LIMITED", 429, "GA4 rate limit exceeded");
      throw new Ga4IntegrationError("UPSTREAM_ERROR", 502, "GA4 request failed");
    }
    try {
      const data = await response.json() as Record<string, unknown>;
      if (!Number.isSafeInteger(data.rowCount) || (data.rowCount as number) < 0 ||
          !(Array.isArray(data.rows) || (data.rowCount === 0 && data.rows === undefined))) throw new Error("Invalid report");
      rowCount = data.rowCount as number;
      const pageRows = (data.rows ?? []) as Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
      if (pageRows.length > PAGE_SIZE) throw new Error("Invalid page size");
      for (const row of pageRows) {
        const day = row.dimensionValues?.[0]?.value;
        const channel = row.dimensionValues?.[1]?.value;
        const values = row.metricValues?.map((metric) => metric.value);
        if (typeof day !== "string" || !/^\d{8}$/.test(day) || typeof channel !== "string" ||
            values?.length !== 3 || values.some((value) => typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value)))) {
          throw new Error("Invalid row");
        }
        const date = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
        const timestamp = parseDay(date);
        if (!Number.isFinite(timestamp) || timestamp < from || timestamp > to) throw new Error("Invalid date");
        rows.push({ date, sessionDefaultChannelGroup: channel, sessions: Number(values[0]), activeUsers: Number(values[1]), eventCount: Number(values[2]) });
      }
      if (rows.length >= rowCount || pageRows.length === 0) break;
    } catch {
      throw new Ga4IntegrationError("UPSTREAM_ERROR", 502, "GA4 returned an invalid report");
    }
  }
  const truncated = rows.length < rowCount;
  return {
    provider: "ga4", scope: { property: input.property }, dateRange: { start: input.start, end: input.end },
    collectedAt: new Date().toISOString(), rows,
    warnings: truncated ? ["GA4 report is incomplete; row limit or pagination boundary reached"] : [],
    status: truncated ? "partial" : "succeeded",
    metadata: { rowCount, fetchedRows: rows.length, truncated },
  };
}
