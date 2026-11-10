import { requireAuth } from "@/lib/auth";
import { listAllLedgerEntries } from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import { ledgerErrorResponse } from "@/lib/ledger/api";
import { ledgerEntriesToCsv } from "@/lib/ledger/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const csv = ledgerEntriesToCsv(await listAllLedgerEntries());
    const filename = `ledger-${kst().format("YYYYMMDD")}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "내보내지 못했어요." });
  }
};
