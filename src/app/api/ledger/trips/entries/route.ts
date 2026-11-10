import { requireAuth } from "@/lib/auth";
import { attachEntriesToTrip, listTripCandidates } from "@/lib/db/ledger";
import { ledgerErrorResponse, readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 여행 기간 안의 미연결 지출 후보. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const tripId = Number(new URL(req.url).searchParams.get("tripId"));
    const entries = await listTripCandidates(tripId);
    return Response.json({ entries });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "후보를 불러오지 못했어요." });
  }
};

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const updated = await attachEntriesToTrip(body.tripId, body.entryIds);
    return Response.json({ updated });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "내역을 연결하지 못했어요." });
  }
};
