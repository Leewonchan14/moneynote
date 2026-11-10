import { requireAuth } from "@/lib/auth";
import { searchLedgerEntries } from "@/lib/db/ledger";
import { ledgerErrorResponse } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const result = await searchLedgerEntries(
      new URL(req.url).searchParams.get("q") ?? ""
    );
    return Response.json({ result });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "검색하지 못했어요." });
  }
};
