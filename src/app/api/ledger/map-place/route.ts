import { requireAuth } from "@/lib/auth";
import { extractMapUrl, isNaverMapUrl } from "@/lib/ledger/map-url";
import { fetchNaverPlacePreview } from "@/lib/ledger/naver-place";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 저장하기 전에 네이버 지도 링크의 장소 이름·사진을 미리 본다.
 * 네이버 주소만 읽고, 못 읽으면 place: null을 돌려준다.
 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const url = extractMapUrl(new URL(req.url).searchParams.get("url") ?? "");
  if (!isNaverMapUrl(url)) {
    return Response.json({ error: "네이버 지도 링크가 아니에요." }, { status: 400 });
  }
  const place = await fetchNaverPlacePreview(url);
  return Response.json({
    place: place && { placeName: place.placeName, imageUrls: place.imageUrls },
  });
};
