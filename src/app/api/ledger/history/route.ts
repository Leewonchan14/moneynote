import { requireAuth } from "@/lib/auth";
import { listLedgerHistory } from "@/lib/db/ledger";
import { ledgerErrorResponse } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const history = await listLedgerHistory();
    return Response.json({ history });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "변경 이력을 불러오지 못했어요." });
  }
};
