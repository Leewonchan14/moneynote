import {
  createLedgerSubcategory,
  deleteLedgerSubcategory,
  updateLedgerSubcategory,
} from "@/lib/db/ledger-extras";
import { crudRoutes } from "@/lib/ledger/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = crudRoutes({
  create: createLedgerSubcategory,
  update: updateLedgerSubcategory,
  remove: deleteLedgerSubcategory,
  fallback: "소분류를 저장하지 못했어요.",
  duplicate: "같은 이름의 소분류가 이미 있어요.",
});

export const POST = routes.POST;
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
