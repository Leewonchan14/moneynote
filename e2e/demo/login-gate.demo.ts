import { devices } from "@playwright/test";
import path from "node:path";

import { test } from "../helpers";
import { E2E_PASSWORD } from "../server";
import { DEMO_OUTPUT_DIR, pause, showTaps, startRecording } from "./recorder";

/*
 * 로그인 화면 데모. 틀린 비밀번호 → 오류 안내 → 맞는 비밀번호로 입장.
 * PC 화면은 밝은·어두운 테마 스크린샷으로 남긴다.
 */
test("로그인 화면", async ({ page, browser, appUrl }) => {
  await page.goto("/");
  await showTaps(page);
  const recording = await startRecording(page);
  await pause(page, 1200);

  const password = page.locator("#password");
  await password.tap();
  await password.pressSequentially("틀린비밀번호", { delay: 60 });
  await page.getByRole("button", { name: "입장하기" }).tap();
  await page.getByRole("alert").waitFor();
  await pause(page, 1800);

  await password.pressSequentially(E2E_PASSWORD, { delay: 60 });
  await page.getByRole("button", { name: "비밀번호 보기" }).tap();
  await pause(page, 1000);
  await page.getByRole("button", { name: "입장하기" }).tap();
  await page.getByRole("button", { name: "내역 추가" }).first().waitFor();
  await pause(page, 1200);

  console.log(await recording.stop("login-gate"));

  for (const colorScheme of ["light", "dark"] as const) {
    const desktop = await browser.newContext({
      ...devices["Desktop Chrome"],
      viewport: { width: 1280, height: 800 },
      colorScheme,
      baseURL: appUrl,
    });
    const pc = await desktop.newPage();
    await pc.goto("/");
    await pc.locator("#password").waitFor();
    // 폼이 나타나고 브랜드 패널 막대가 다 자란 뒤 찍는다.
    await pause(pc, 1200);
    if (colorScheme === "dark") {
      await pc.evaluate(() => document.documentElement.classList.add("dark"));
      await pc.locator("#password").fill("틀린비밀번호");
      await pc.keyboard.press("Enter");
      await pc.getByRole("alert").waitFor();
      await pause(pc, 700);
    }
    const shot = path.join(DEMO_OUTPUT_DIR, `login-gate-desktop-${colorScheme}.png`);
    await pc.screenshot({ path: shot });
    console.log(shot);
    await desktop.close();
  }
});
