import { requireAuth } from "@/lib/auth";
import { getLedgerMapPlaces, refreshLedgerMapPlaces } from "@/lib/db/ledger-map";
import { ledgerErrorResponse } from "@/lib/ledger/api";
import { toMapRange, type LedgerMapSubcategory } from "@/lib/ledger/map-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 숫자 id만 받는다. 없으면 null, 숫자가 아니면 어떤 행과도 맞지 않는 -1로 둔다. */
const toId = (value: string | null) =>
  value === null || value === "" ? null : /^\d+$/.test(value) ? Number(value) : -1;

const toSub = (value: string | null): LedgerMapSubcategory | null =>
  value === "none" ? "none" : toId(value);

/**
 * 내역 지도: 지도 링크에서 좌표를 읽은 지출을 장소별로.
 * ?range=all|year|month, ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD, ?range=trip&trip=<id>
 * 어느 기간이든 &category=<분류 id>(&sub=<소분류 id>|none)로 그 분류 지출만 본다.
 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const params = new URL(req.url).searchParams;
    return Response.json(
      await getLedgerMapPlaces({
        range: toMapRange(params.get("range")),
        from: params.get("from"),
        to: params.get("to"),
        trip: toId(params.get("trip")),
        category: toId(params.get("category")),
        sub: toSub(params.get("sub")),
      })
    );
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "내역 지도를 불러오지 못했어요." });
  }
};

/** 좌표를 못 읽은 네이버 지도 링크를 다시 읽는다. */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    return Response.json(await refreshLedgerMapPlaces());
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "장소를 다시 찾지 못했어요." });
  }
};
