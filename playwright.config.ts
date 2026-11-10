import { defineConfig, devices } from "@playwright/test";

/**
 * 테스트마다 임시 DB를 쓰는 서버를 따로 띄운다(e2e/helpers.ts).
 * 운영 컨테이너와 실제 데이터에는 접속하지 않는다.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // 순수 계산 테스트는 화면 크기와 상관없으므로 한 번만 돌린다.
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /ledger-logic/ },
  ],
});
