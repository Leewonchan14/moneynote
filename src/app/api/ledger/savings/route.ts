import {
  createLedgerSavings,
  deleteLedgerSavings,
  updateLedgerSavings,
} from "@/lib/db/ledger-extras";
import { crudRoutes } from "@/lib/ledger/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = crudRoutes({
  create: createLedgerSavings,
  update: updateLedgerSavings,
  remove: deleteLedgerSavings,
  fallback: "저축 상품을 저장하지 못했어요.",
  duplicate: "같은 이름의 저축 상품이 이미 있어요.",
});

export const POST = routes.POST;
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
