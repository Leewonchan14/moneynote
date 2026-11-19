import { requireAuth } from "@/lib/auth";
import { getLedgerRecap } from "@/lib/db/ledger-recap";
import { kst } from "@/lib/kst";
import { ledgerErrorResponse } from "@/lib/ledger/api";
import { weekStartOf } from "@/lib/ledger/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * 고른 기간의 리캡.
 * ?period=month&month=YYYY-MM 또는 ?period=week&week=YYYY-MM-DD(그 주의 아무 날).
 * 값이 없거나 잘못되면 이번 달·이번 주로 대체한다.
 * &categoryId=<id>[&subcategory=<id>|none]를 주면 그 분류(소분류)의 지출만 본다.
 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const params = new URL(req.url).searchParams;
  const today = kst().format("YYYY-MM-DD");
  const period = params.get("period") === "week" ? "week" : "month";
  const monthParam = params.get("month");
  const weekParam = params.get("week");
  const key =
    period === "week"
      ? weekStartOf(weekParam && DATE.test(weekParam) ? weekParam : today)
      : monthParam && MONTH.test(monthParam)
        ? monthParam
        : today.slice(0, 7);

  try {
    const excludeTrips = params.get("excludeTrips") === "1";
    const categoryId = Number(params.get("categoryId"));
    const subParam = params.get("subcategory");
    const subId = Number(subParam);
    const category =
      Number.isInteger(categoryId) && categoryId > 0
        ? {
            categoryId,
            subcategory:
              subParam === "none"
                ? ("none" as const)
                : Number.isInteger(subId) && subId > 0
                  ? subId
                  : ("all" as const),
          }
        : null;
    return Response.json({
      recap: await getLedgerRecap(period, key, { excludeTrips, category }),
    });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "리캡을 불러오지 못했어요." });
  }
};
