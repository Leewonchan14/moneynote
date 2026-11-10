import { requireAuth } from "@/lib/auth";
import { getLedgerStats } from "@/lib/db/ledger-stats";
import { ledgerErrorResponse } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 기간별 가계부 통계. from/to를 생략하면 첫 기록부터 오늘까지. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const params = new URL(req.url).searchParams;

  try {
    const trip = params.get("trip");
    const stats = await getLedgerStats(params.get("from"), params.get("to"), {
      tripId: trip === null ? null : Number(trip),
      excludeTrips: params.get("excludeTrips") === "1",
    });
    return Response.json({ stats });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "통계를 불러오지 못했어요." });
  }
};
