import { defineConfig, devices } from "@playwright/test";

/**
 * PR 데모 GIF 녹화(npm run demo). e2e와 같은 방식으로 빌드하고
 * 임시 DB에 샘플 데이터를 넣어 찍는다. 실제 데이터는 쓰지 않는다.
 */
export default defineConfig({
  testDir: "./e2e/demo",
  testMatch: /.*\.demo\.ts/,
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  timeout: 180_000,
  reporter: [["list"]],
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
});
