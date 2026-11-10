import { mergeLedgerAsset } from "@/lib/db/ledger-extras";
import { crudRoutes } from "@/lib/ledger/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = crudRoutes({
  create: mergeLedgerAsset,
  fallback: "결제수단을 합치지 못했어요.",
});

export const POST = routes.POST;
