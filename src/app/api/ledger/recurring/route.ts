import {
  createLedgerRecurring,
  deleteLedgerRecurring,
  setLedgerRecurringActive,
} from "@/lib/db/ledger-extras";
import { crudRoutes } from "@/lib/ledger/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = crudRoutes({
  create: createLedgerRecurring,
  update: setLedgerRecurringActive,
  remove: deleteLedgerRecurring,
  fallback: "반복 거래를 저장하지 못했어요.",
  duplicate: "같은 반복 거래가 이미 있어요.",
});

export const POST = routes.POST;
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
