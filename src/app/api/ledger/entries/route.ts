import { requireAuth } from "@/lib/auth";
import {
  createLedgerEntry,
  deleteLedgerEntry,
  updateLedgerEntry,
  type LedgerEntryInput,
} from "@/lib/db/ledger";
import { ledgerErrorResponse, readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const entry = await createLedgerEntry(body as unknown as LedgerEntryInput);
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "기록을 저장하지 못했어요." });
  }
};

export const PATCH = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  const { id, ...rest } = body;

  try {
    const entry = await updateLedgerEntry(
      id as number,
      rest as unknown as LedgerEntryInput
    );
    return Response.json({ entry });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "기록을 수정하지 못했어요." });
  }
};

export const DELETE = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    await deleteLedgerEntry(body.id as number);
    return Response.json({ ok: true });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "기록을 지우지 못했어요." });
  }
};
