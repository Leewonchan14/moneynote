import { requireAuth } from "@/lib/auth";
import { getDayRouteDays } from "@/lib/db/ledger-day-route";
import { ledgerErrorResponse } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD 기간에서 동선 보기를 띄울 수 있는 날과 그날 요약 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const params = new URL(req.url).searchParams;
    return Response.json(await getDayRouteDays(params.get("from"), params.get("to")));
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "동선 있는 날을 불러오지 못했어요." });
  }
};
