import type { ReceiptLine } from "@/lib/ledger/receipt";

/** 80mm 감열지 프린터의 한 줄 점 개수. */
export const RECEIPT_WIDTH = 576;
const PAD = 36;
/** 위아래 찢긴 톱니 높이. */
const TEETH = 14;
const PAPER = "#fbfaf6";
const INK = "#2a2a2a";
const MUTED = "#8a8782";
const FONT =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Apple SD Gothic Neo', 'Noto Sans KR', monospace";

const HEIGHT: Record<ReceiptLine["kind"], number> = {
  title: 70,
  center: 38,
  rule: 30,
  row: 38,
  total: 58,
  barcode: 128,
  space: 16,
};

/** 같은 주는 늘 같은 바코드가 나오도록 seed로 굵기를 정한다. */
const barWidths = (seed: string) => {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  const next = () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: 64 }, () => 1 + Math.floor(next() * 4));
};

/** 오른쪽 금액 자리를 남기고 왼쪽 글자가 넘치면 말줄임한다. */
const fitText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
};

const tornEdge = (ctx: CanvasRenderingContext2D, y: number, downward: boolean) => {
  const step = 18;
  ctx.lineTo(downward ? RECEIPT_WIDTH : 0, y);
  for (let x = 0; x <= RECEIPT_WIDTH; x += step) {
    const px = downward ? RECEIPT_WIDTH - x : x;
    const tooth = (x / step) % 2 === 0 ? 0 : TEETH;
    ctx.lineTo(px, downward ? y + tooth : y - tooth);
  }
};

/** 영수증 줄 목록을 감열지처럼 그린 캔버스. 3D 종이의 텍스처와 저장 이미지로 함께 쓴다. */
export const drawReceipt = (lines: ReceiptLine[]): HTMLCanvasElement => {
  const bodyHeight = lines.reduce((sum, line) => sum + HEIGHT[line.kind], 0);
  const height = TEETH * 2 + 30 + bodyHeight + 30;
  const canvas = document.createElement("canvas");
  canvas.width = RECEIPT_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // 위아래가 톱니로 찢긴 종이. 바깥은 투명하게 둔다.
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.moveTo(0, TEETH);
  tornEdge(ctx, TEETH, false);
  tornEdge(ctx, height - TEETH, true);
  ctx.closePath();
  ctx.fill();

  let y = TEETH + 30;
  const right = RECEIPT_WIDTH - PAD;
  for (const line of lines) {
    const h = HEIGHT[line.kind];
    const mid = y + h / 2;
    ctx.textBaseline = "middle";
    switch (line.kind) {
      case "title":
        ctx.fillStyle = INK;
        ctx.font = `800 44px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(line.text, RECEIPT_WIDTH / 2, mid);
        break;
      case "center":
        ctx.fillStyle = line.muted ? MUTED : INK;
        ctx.font = `500 22px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(
          fitText(ctx, line.text, RECEIPT_WIDTH - PAD * 2),
          RECEIPT_WIDTH / 2,
          mid
        );
        break;
      case "rule":
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.setLineDash(line.style === "dash" ? [8, 6] : []);
        for (const offset of line.style === "double" ? [-3, 3] : [0]) {
          ctx.beginPath();
          ctx.moveTo(PAD, mid + offset);
          ctx.lineTo(right, mid + offset);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        break;
      case "row":
      case "total": {
        const big = line.kind === "total";
        ctx.fillStyle = line.kind === "row" && line.muted ? MUTED : INK;
        ctx.font = `${big ? "800 34px" : "500 23px"} ${FONT}`;
        ctx.textAlign = "right";
        ctx.fillText(line.right, right, mid);
        const rightWidth = ctx.measureText(line.right).width;
        ctx.textAlign = "left";
        ctx.fillText(fitText(ctx, line.left, right - PAD - rightWidth - 20), PAD, mid);
        break;
      }
      case "barcode": {
        const widths = barWidths(line.seed);
        const total = widths.reduce((sum, w, i) => sum + w * 3 + (i % 2 ? 3 : 0), 0);
        let x = (RECEIPT_WIDTH - total) / 2;
        ctx.fillStyle = INK;
        widths.forEach((w, i) => {
          if (i % 2 === 0) ctx.fillRect(x, y + 14, w * 3, 70);
          x += w * 3 + (i % 2 ? 3 : 0);
        });
        ctx.font = `500 18px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(line.text, RECEIPT_WIDTH / 2, y + 104);
        break;
      }
      case "space":
        break;
    }
    y += h;
  }
  return canvas;
};
