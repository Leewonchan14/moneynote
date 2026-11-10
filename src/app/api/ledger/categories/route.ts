import { requireAuth } from "@/lib/auth";
import {
  createLedgerCategory,
  deleteLedgerCategory,
  updateLedgerCategory,
  type LedgerCategoryInput,
  type LedgerCategoryUpdate,
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
    const category = await createLedgerCategory(body as unknown as LedgerCategoryInput);
    return Response.json({ category });
  } catch (error) {
    return ledgerErrorResponse(error, {
      fallback: "분류를 추가하지 못했어요.",
      duplicate: "같은 이름의 분류가 이미 있어요.",
    });
  }
};

export const PATCH = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const category = await updateLedgerCategory(body as unknown as LedgerCategoryUpdate);
    return Response.json({ category });
  } catch (error) {
    return ledgerErrorResponse(error, {
      fallback: "분류를 수정하지 못했어요.",
      duplicate: "같은 이름의 분류가 이미 있어요.",
    });
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
    await deleteLedgerCategory(body.id as number, body.moveToId);
    return Response.json({ ok: true });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "분류를 삭제하지 못했어요." });
  }
};
