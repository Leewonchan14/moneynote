import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import gifenc from "gifenc";
import jpeg from "jpeg-js";

import type { Locator, Page } from "@playwright/test";

// gifenc는 CommonJS라 이름 있는 import를 Node ESM이 읽지 못한다.
const { applyPalette, GIFEncoder, quantize } = gifenc;

/** PR에 붙일 GIF가 쌓이는 곳. .gitignore에 들어 있다. */
export const DEMO_OUTPUT_DIR = path.resolve(import.meta.dirname, "../../demo-output");

/** 이보다 짧은 간격의 화면 변화는 한 장으로 합쳐 GIF 크기를 줄인다. */
const MIN_FRAME_MS = 80;
/** 마지막 화면을 이만큼 보여 준 뒤 처음으로 돌아간다. */
const LAST_FRAME_MS = 1500;

/**
 * 헤드리스 녹화에는 포인터가 안 보이므로, 누른 곳에 원을 잠깐 그린다.
 * 페이지를 열기 전에 불러야 한다.
 */
export const showTaps = async (page: Page) => {
  await page.addInitScript(() => {
    const draw = (event: PointerEvent) => {
      const dot = document.createElement("div");
      Object.assign(dot.style, {
        position: "fixed",
        left: `${event.clientX - 18}px`,
        top: `${event.clientY - 18}px`,
        width: "36px",
        height: "36px",
        borderRadius: "9999px",
        background: "rgba(239, 68, 68, 0.35)",
        border: "2px solid rgba(239, 68, 68, 0.9)",
        pointerEvents: "none",
        zIndex: "2147483647",
        transition: "opacity 600ms ease-out, transform 600ms ease-out",
      });
      document.documentElement.appendChild(dot);
      requestAnimationFrame(() => {
        dot.style.opacity = "0";
        dot.style.transform = "scale(1.6)";
      });
      setTimeout(() => dot.remove(), 700);
    };
    window.addEventListener("pointerdown", draw, { capture: true });
  });
};

/**
 * 대상이 화면 위쪽에 오도록 가장 가까운 스크롤 영역을 천천히 움직인다.
 * smooth scrollIntoView는 헤드리스에서 중간 화면이 녹화되지 않거나 끊길 때가 있다.
 */
export const scrollToTarget = async (
  target: Locator,
  { duration = 900, offset = 12 } = {}
) => {
  await target.evaluate(
    async (el, { duration, offset }) => {
      let box: HTMLElement | null = el.parentElement;
      while (
        box &&
        !(
          box.scrollHeight > box.clientHeight &&
          /(auto|scroll)/.test(getComputedStyle(box).overflowY)
        )
      ) {
        box = box.parentElement;
      }
      const scroller = box ?? document.scrollingElement ?? document.documentElement;
      const scrollerTop = box ? box.getBoundingClientRect().top : 0;
      const from = scroller.scrollTop;
      const to = from + el.getBoundingClientRect().top - scrollerTop - offset;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          scroller.scrollTop = from + (to - from) * eased;
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },
    { duration, offset }
  );
};

/** 사람이 읽을 시간을 준다. 녹화 중 화면 변화가 없으면 프레임 지연으로 들어간다. */
export const pause = (page: Page, ms = 1200) => page.waitForTimeout(ms);

/** 화면을 찍는 간격. 실제 간격은 스크린샷 시간만큼 더 길어진다. */
const CAPTURE_INTERVAL_MS = 60;

/**
 * 녹화를 멈출 때까지 일정한 간격으로 스크린샷을 찍어 GIF로 저장한다.
 * CDP screencast는 헤드리스에서 프레임을 꾸준히 보내지 않아 스크롤 중간이 빠진다.
 * GIF는 뷰포트 CSS 픽셀 크기로 저장되므로 PR 본문에서는 <img width>로 줄여 보여 준다.
 */
export const startRecording = async (page: Page) => {
  const frames: { data: Buffer; at: number }[] = [];
  let recording = true;

  const loop = (async () => {
    while (recording) {
      const at = Date.now();
      try {
        const data = await page.screenshot({ type: "jpeg", quality: 85, scale: "css" });
        frames.push({ data, at });
      } catch {
        // 페이지 이동 중에는 실패할 수 있다. 다음 차례에 다시 찍는다.
      }
      await new Promise((resolve) => setTimeout(resolve, CAPTURE_INTERVAL_MS));
    }
  })();

  /** 녹화를 멈추고 demo-output/<name>.gif로 저장한 뒤 경로를 돌려준다. */
  const stop = async (name: string): Promise<string> => {
    recording = false;
    await loop;
    if (!frames.length) throw new Error("녹화된 화면이 없어요.");

    // 너무 촘촘하거나 앞과 똑같은 화면은 건너뛰고,
    // 남은 프레임의 표시 시간을 다음 프레임까지로 잡는다.
    const kept: typeof frames = [];
    for (const frame of frames) {
      const last = kept.at(-1);
      if (last && (frame.at - last.at < MIN_FRAME_MS || frame.data.equals(last.data)))
        continue;
      kept.push(frame);
    }
    const gif = GIFEncoder();
    kept.forEach((frame, index) => {
      const { width: w, height: h, data } = jpeg.decode(frame.data, { useTArray: true });
      const palette = quantize(data, 256);
      const delay =
        index === kept.length - 1
          ? LAST_FRAME_MS
          : Math.max(MIN_FRAME_MS, Math.round(kept[index + 1].at - frame.at));
      gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay });
    });
    gif.finish();

    mkdirSync(DEMO_OUTPUT_DIR, { recursive: true });
    const file = path.join(DEMO_OUTPUT_DIR, `${name}.gif`);
    writeFileSync(file, gif.bytes());

    // DEMO_KEEP_FRAMES=1이면 GIF에 들어간 프레임을 jpg로도 남겨 눈으로 확인한다.
    if (process.env.DEMO_KEEP_FRAMES) {
      const dir = path.join(DEMO_OUTPUT_DIR, `${name}-frames`);
      mkdirSync(dir, { recursive: true });
      kept.forEach((frame, index) =>
        writeFileSync(path.join(dir, `${String(index).padStart(3, "0")}.jpg`), frame.data)
      );
    }
    return file;
  };

  return { stop };
};
