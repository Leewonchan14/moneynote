import { requireAuth } from "@/lib/auth";
import { getLedgerMonth } from "@/lib/db/ledger";
import { materializeRecurring } from "@/lib/db/ledger-extras";
import { kst } from "@/lib/kst";
import { ledgerErrorResponse } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 해당 월의 가계부 전체(내역·예산·통계)를 반환한다. 잘못된 month는 이번 달로 대체. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const monthParam = new URL(req.url).searchParams.get("month");
  const month =
    monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)
      ? monthParam
      : kst().format("YYYY-MM");

  try {
    await materializeRecurring();
    const ledger = await getLedgerMonth(month);
    return Response.json({ ledger });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "가계부를 불러오지 못했어요." });
  }
};
