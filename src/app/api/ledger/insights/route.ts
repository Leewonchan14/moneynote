import { requireAuth } from "@/lib/auth";
import { getLedgerInsights } from "@/lib/db/ledger-insights";
import { ledgerErrorResponse } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 평소와 다른 지출, 저축·고정비 비중. month=YYYY-MM */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const params = new URL(req.url).searchParams;
  try {
    const insights = await getLedgerInsights(params.get("month"), {
      excludeTrips: params.get("excludeTrips") === "1",
    });
    return Response.json({ insights });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "인사이트를 불러오지 못했어요." });
  }
};
