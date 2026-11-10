import {
  createLedgerAsset,
  deleteLedgerAsset,
  updateLedgerAsset,
} from "@/lib/db/ledger-extras";
import { crudRoutes } from "@/lib/ledger/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = crudRoutes({
  create: createLedgerAsset,
  update: updateLedgerAsset,
  remove: deleteLedgerAsset,
  fallback: "결제수단을 저장하지 못했어요.",
  duplicate: "같은 이름의 결제수단이 이미 있어요.",
});

export const POST = routes.POST;
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
