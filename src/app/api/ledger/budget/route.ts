import { requireAuth } from "@/lib/auth";
import { saveLedgerBudget, type LedgerBudgetInput } from "@/lib/db/ledger";
import { ledgerErrorResponse, readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 월 예산·메모·분류별 예산을 통째로 저장한다. */
export const PUT = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    await saveLedgerBudget(body as unknown as LedgerBudgetInput);
    return Response.json({ ok: true });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "예산을 저장하지 못했어요." });
  }
};
