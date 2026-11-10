import { requireAuth } from "@/lib/auth";
import { getRecurringCandidates } from "@/lib/db/ledger-extras";
import { ledgerErrorResponse } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    return Response.json({ candidates: await getRecurringCandidates() });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "추천을 불러오지 못했어요." });
  }
};
