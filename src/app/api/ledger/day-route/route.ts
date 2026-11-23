import { requireAuth } from "@/lib/auth";
import { getDayRoute } from "@/lib/db/ledger-day-route";
import { ledgerErrorResponse } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 그날의 동선: ?date=YYYY-MM-DD 지출 중 지도에 찍힌 곳을 시간 순서로 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const date = new URL(req.url).searchParams.get("date");
    return Response.json(await getDayRoute(date));
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "그날 동선을 불러오지 못했어요." });
  }
};
