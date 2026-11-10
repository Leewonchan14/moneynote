import { execSync } from "node:child_process";
import { cpSync } from "node:fs";
import path from "node:path";

import { makeTempDir, removeDir, STANDALONE_DIR, startServer } from "./server";

const ROOT = path.resolve(import.meta.dirname, "..");

/** 앱을 빌드하고, 마이그레이션까지 끝난 빈 DB를 템플릿으로 만들어 둔다. */
export default async function globalSetup() {
  if (!process.env.E2E_SKIP_BUILD) {
    execSync("npm run build", {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
  }

  // Dockerfile과 같은 배치로 맞춘다.
  cpSync(path.join(ROOT, ".next/static"), path.join(STANDALONE_DIR, ".next/static"), {
    recursive: true,
  });
  cpSync(path.join(ROOT, "drizzle"), path.join(STANDALONE_DIR, "drizzle"), {
    recursive: true,
  });

  const template = makeTempDir("template");
  const server = await startServer(template);
  await server.stop();
  process.env.E2E_TEMPLATE_DB = template;

  return () => removeDir(template);
}
