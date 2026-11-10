import { requireAuth } from "@/lib/auth";
import { restoreLedgerEntry } from "@/lib/db/ledger";
import { ledgerErrorResponse, readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const entry = await restoreLedgerEntry(body.id as number);
    return Response.json({ entry });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "기록을 되돌리지 못했어요." });
  }
};
