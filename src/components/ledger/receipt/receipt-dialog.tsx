"use client";

import { Download, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { drawReceipt } from "@/components/ledger/receipt/draw-receipt";
import { usePrefersReducedMotion } from "@/components/ledger/three/scene-utils";
import { shortDate } from "@/components/ledger/trend-chart";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { kst } from "@/lib/kst";
import type { LedgerRecap } from "@/lib/ledger/recap";
import { buildReceiptLines, receiptLineText } from "@/lib/ledger/receipt";

// three.js는 영수증을 뽑을 때만 받는다.
const ReceiptPrinter = dynamic(
  () => import("@/components/ledger/three/receipt-printer"),
  {
    ssr: false,
    loading: () => <div className="h-[420px] animate-pulse rounded-lg bg-muted" />,
  }
);

const receiptTitle = (recap: LedgerRecap) =>
  recap.period === "week" ? "주간 영수증" : "월간 영수증";

interface Props {
  recap: LedgerRecap;
  budgetLine: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReceiptDialog = ({ recap, budgetLine, open, onOpenChange }: Props) => {
  // 열 때마다, 그리고 다시 뽑을 때마다 새로 출력한다(출력 시각도 새로 찍힌다).
  const [run, setRun] = useState(0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{receiptTitle(recap)}</DialogTitle>
          <DialogDescription>
            {shortDate(recap.from)} ~ {shortDate(recap.to)} 지출을 한 장으로 뽑았어요.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ReceiptBody
            key={run}
            recap={recap}
            budgetLine={budgetLine}
            onReprint={() => setRun((value) => value + 1)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

const ReceiptBody = ({
  recap,
  budgetLine,
  onReprint,
}: {
  recap: LedgerRecap;
  budgetLine: string | null;
  onReprint: () => void;
}) => {
  const reduced = usePrefersReducedMotion();
  const [printed, setPrinted] = useState(reduced);
  const [printedAt] = useState(() => kst().format("YYYY.MM.DD HH:mm"));
  const lines = useMemo(
    () => buildReceiptLines(recap, { printedAt, budgetLine }),
    [recap, printedAt, budgetLine]
  );
  const receipt = useMemo(() => drawReceipt(lines), [lines]);
  const image = useMemo(() => receipt.toDataURL("image/png"), [receipt]);

  if (!printed) {
    return (
      <div>
        <ReceiptPrinter receipt={receipt} onDone={() => setPrinted(true)} />
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setPrinted(true)}>
            건너뛰기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 3D 종이와 같은 캔버스를 그대로 이미지로 보여 준다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt={`${receiptTitle(recap)}, 합계 ${recap.expense.toLocaleString("ko-KR")}원`}
        className="w-full max-w-[300px] animate-in drop-shadow-md duration-500 fade-in slide-in-from-top-4"
      />
      <ul className="sr-only">
        {lines.map((line, index) => {
          const text = receiptLineText(line);
          return text ? <li key={index}>{text}</li> : null;
        })}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onReprint}>
          <RotateCcw />
          다시 뽑기
        </Button>
        <Button
          variant="outline"
          size="sm"
          render={<a href={image} download={`머니노트-영수증-${recap.from}.png`} />}
          nativeButton={false}
        >
          <Download />
          이미지 저장
        </Button>
      </div>
    </div>
  );
};
