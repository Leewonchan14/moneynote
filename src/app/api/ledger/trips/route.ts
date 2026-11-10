import { requireAuth } from "@/lib/auth";
import {
  createLedgerTrip,
  deleteLedgerTrip,
  updateLedgerTrip,
  type LedgerTripInput,
} from "@/lib/db/ledger";
import { ledgerErrorResponse, readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const duplicate = "같은 이름의 여행이 이미 있어요.";

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const trip = await createLedgerTrip(body as unknown as LedgerTripInput);
    return Response.json({ trip }, { status: 201 });
  } catch (error) {
    return ledgerErrorResponse(error, {
      fallback: "여행을 추가하지 못했어요.",
      duplicate,
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

  const { id, ...rest } = body;

  try {
    const trip = await updateLedgerTrip(id, rest as unknown as LedgerTripInput);
    return Response.json({ trip });
  } catch (error) {
    return ledgerErrorResponse(error, {
      fallback: "여행을 수정하지 못했어요.",
      duplicate,
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
    await deleteLedgerTrip(body.id);
    return Response.json({ ok: true });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "여행을 삭제하지 못했어요." });
  }
};
