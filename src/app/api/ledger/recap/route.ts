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
    return Response.json({ recap: await getLedgerRecap(period, key) });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "리캡을 불러오지 못했어요." });
  }
};
