import { requireAuth } from "@/lib/auth";
import { createLedgerEntriesBulk, type LedgerBulkEntryInput } from "@/lib/db/ledger";
import { ledgerErrorResponse, readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 은행 알림 붙여넣기처럼 여러 건을 한 번에 등록한다. 이미 있는 기록은 건너뛴다. */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const { created, skipped } = await createLedgerEntriesBulk(
      body.entries as LedgerBulkEntryInput[],
      { source: "web" }
    );
    return Response.json({ created: created.length, skipped }, { status: 201 });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "내역을 등록하지 못했어요." });
  }
};
