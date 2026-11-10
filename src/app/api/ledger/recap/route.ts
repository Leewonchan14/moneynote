import { requireAuth } from "@/lib/auth";
import { getLedgerWeeklyRecap } from "@/lib/db/ledger-recap";
import { ledgerErrorResponse } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 가장 최근에 끝난 주의 리캡. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    return Response.json({ recap: await getLedgerWeeklyRecap() });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "주간 리캡을 불러오지 못했어요." });
  }
};
