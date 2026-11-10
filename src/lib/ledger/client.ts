/** 모든 가계부 쿼리는 ["ledger", ...] 아래에 두어 한 번에 무효화한다. */
export const ledgerKeys = {
  all: ["ledger"] as const,
  month: (month: string) => ["ledger", "month", month] as const,
  stats: (from?: string, to?: string, scope?: string) =>
    ["ledger", "stats", from ?? "all", to ?? "today", scope ?? "all-entries"] as const,
  tripCandidates: (tripId: number) => ["ledger", "trip-candidates", tripId] as const,
  search: (query: string) => ["ledger", "search", query] as const,
  history: ["ledger", "history"] as const,
  recap: (period: string, key: string) => ["ledger", "recap", period, key] as const,
  suggestions: ["ledger", "suggestions"] as const,
  recurringCandidates: ["ledger", "recurring-candidates"] as const,
  insights: (month: string, scope?: string) =>
    ["ledger", "insights", month, scope ?? "all-entries"] as const,
};

/** 다른 기기에서 입력한 내역도 자동으로 보이게 한다. */
export const LEDGER_LIVE_QUERY = {
  staleTime: 10_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
} as const;

interface LedgerRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}

export const ledgerRequest = async <T = unknown>(
  token: string,
  path: string,
  options: LedgerRequestOptions = {}
): Promise<T> => {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      "x-auth-token": token,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || data === null) {
    throw new Error(data?.error ?? "요청을 처리하지 못했어요.");
  }
  return data;
};
