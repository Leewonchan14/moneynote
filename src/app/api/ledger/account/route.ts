import { requireAuth } from "@/lib/auth";
import { saveLedgerAccount, type LedgerAccountInput } from "@/lib/db/ledger";
import { ledgerErrorResponse, readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 시작 잔액 저장, 또는 actualBalance로 실제 통장 잔액에 맞추기. */
export const PUT = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const account = await saveLedgerAccount(body as LedgerAccountInput);
    return Response.json({ account });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "잔액을 저장하지 못했어요." });
  }
};
