import { LedgerError } from "@/lib/db/ledger";

const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
};

/** 실패한 JSON 본문은 null로 돌려준다. */
export const readJsonBody = async (
  req: Request
): Promise<Record<string, unknown> | null> => {
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

/**
 * 검증 오류는 400, 중복 이름(Postgres 23505)은 409, 나머지는 500으로 변환한다.
 */
export const ledgerErrorResponse = (
  error: unknown,
  options: { fallback: string; duplicate?: string }
): Response => {
  if (error instanceof LedgerError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (options.duplicate && isUniqueViolation(error)) {
    return Response.json({ error: options.duplicate }, { status: 409 });
  }
  console.error(error);
  return Response.json({ error: options.fallback }, { status: 500 });
};
