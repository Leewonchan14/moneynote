import { kst } from "@/lib/kst";
import type { LedgerRecap } from "@/lib/ledger/recap";

/** 영수증 한 줄. 그리는 쪽(캔버스)과 화면 읽기용 텍스트가 같은 목록을 쓴다. */
export type ReceiptLine =
  | { kind: "title"; text: string }
  | { kind: "center"; text: string; muted?: boolean }
  | { kind: "rule"; style: "dash" | "double" }
  | { kind: "row"; left: string; right: string; muted?: boolean }
  | { kind: "total"; left: string; right: string }
  | { kind: "barcode"; seed: string; text: string }
  | { kind: "space" };

/** 영수증이 너무 길어지지 않게 이만큼만 한 줄씩 찍고 나머지는 묶는다. */
export const RECEIPT_MAX_ITEMS = 40;

const won = (amount: number) => amount.toLocaleString("ko-KR");

const diffText = (expense: number, previous: number) => {
  if (previous === 0) return "기록 없음";
  const diff = expense - previous;
  if (diff === 0) return "같음";
  return `${diff > 0 ? "+" : "-"}${won(Math.abs(diff))}`;
};

export const buildReceiptLines = (
  recap: LedgerRecap,
  options: { printedAt: string; budgetLine?: string | null }
): ReceiptLine[] => {
  const from = kst(recap.from);
  const to = kst(recap.to);
  const shown = recap.items.slice(0, RECEIPT_MAX_ITEMS - 1);
  const rest = recap.items.slice(shown.length);
  // 딱 한 건 넘칠 때는 묶지 않고 그대로 찍는다.
  const visible = rest.length === 1 ? recap.items : shown;
  const hidden = rest.length === 1 ? [] : rest;

  const byCategory = new Map<string, number>();
  for (const item of recap.items) {
    const name = item.categoryName ?? "미분류";
    byCategory.set(name, (byCategory.get(name) ?? 0) + item.amount);
  }
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  const spendDays = new Set(recap.items.map((item) => item.date)).size;
  const days = to.diff(from, "day") + 1;
  const isWeek = recap.period === "week";

  return [
    { kind: "title", text: "MONEYNOTE" },
    { kind: "center", text: `머니노트 ${isWeek ? "주간" : "월간"} 영수증` },
    {
      kind: "center",
      text: `${from.format("YYYY.MM.DD (ddd)")} ~ ${to.format("MM.DD (ddd)")}`,
      muted: true,
    },
    { kind: "rule", style: "dash" },
    ...visible.map((item): ReceiptLine => ({
      kind: "row",
      left: `${kst(item.date).format("MM.DD")} ${item.label}`,
      right: won(item.amount),
    })),
    ...(hidden.length
      ? [
          {
            kind: "row",
            left: `외 ${hidden.length}건`,
            right: won(hidden.reduce((sum, item) => sum + item.amount, 0)),
            muted: true,
          } satisfies ReceiptLine,
        ]
      : []),
    { kind: "rule", style: "dash" },
    { kind: "row", left: "품목 수", right: `${recap.expenseCount}건` },
    { kind: "total", left: "합계", right: `${won(recap.expense)}원` },
    {
      kind: "row",
      left: isWeek ? "전주 대비" : "전월 대비",
      right: diffText(recap.expense, recap.previousExpense),
      muted: true,
    },
    { kind: "rule", style: "dash" },
    ...(topCategory
      ? [
          {
            kind: "row",
            left: `최다 분류 · ${topCategory[0]}`,
            right: won(topCategory[1]),
          } satisfies ReceiptLine,
        ]
      : []),
    { kind: "row", left: "무지출", right: `${days - spendDays}일` },
    ...(options.budgetLine
      ? [{ kind: "center", text: options.budgetLine, muted: true } satisfies ReceiptLine]
      : []),
    { kind: "rule", style: "double" },
    {
      kind: "barcode",
      seed: `${recap.from}:${recap.expense}`,
      text: `MN-${from.format("YYYYMMDD")}-${String(recap.expenseCount).padStart(3, "0")}`,
    },
    {
      kind: "center",
      text: isWeek ? "이번 주도 수고했어요 :)" : "이번 달도 수고했어요 :)",
    },
    { kind: "center", text: `출력 ${options.printedAt}`, muted: true },
  ];
};

/** 화면 읽기 프로그램과 테스트용: 영수증을 줄글로 옮긴다. */
export const receiptLineText = (line: ReceiptLine): string | null => {
  switch (line.kind) {
    case "title":
    case "center":
      return line.text;
    case "row":
    case "total":
      return `${line.left} ${line.right}`;
    case "barcode":
      return line.text;
    default:
      return null;
  }
};
