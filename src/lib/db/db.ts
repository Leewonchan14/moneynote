import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";

import * as schema from "./schema";

const createDb = () => {
  const dataDir =
    process.env.MONEYNOTE_DATA_DIR ?? path.join(process.cwd(), "data", "pglite");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  return { client, db: drizzle({ client, schema }) };
};

type LedgerDb = ReturnType<typeof createDb>;

// PGlite는 한 데이터 폴더에 한 인스턴스만 열 수 있어서, 라우트 번들끼리 공유한다.
const shared = globalThis as unknown as { __ledgerDb?: LedgerDb };

const getStore = (): LedgerDb => (shared.__ledgerDb ??= createDb());

export const getDb = () => getStore().db;

export const runMigrations = () =>
  migrate(getDb(), { migrationsFolder: path.join(process.cwd(), "drizzle") });

/** 종료 신호를 받으면 DB를 닫아 데이터 폴더를 깨끗한 상태로 남긴다. */
export const closeDbOnExit = () => {
  process.once("SIGTERM", () => {
    getStore()
      .client.close()
      .finally(() => process.exit(0));
  });
};

export { schema };
