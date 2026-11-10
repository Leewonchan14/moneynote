"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/lib/auth-store";
import { ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatDayKo, formatWon, todayKst } from "@/lib/ledger/format";
import {
  parseLedgerNotifications,
  suggestLedgerCategoryName,
} from "@/lib/ledger/notification";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PasteDialog = ({ open, onOpenChange }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>알림 붙여넣기</DialogTitle>
        <DialogDescription>
          은행 알림 문장을 붙여넣으면 금액과 날짜를 읽어 한 번에 등록해요.
        </DialogDescription>
      </DialogHeader>
      <PasteForm onOpenChange={onOpenChange} />
    </DialogContent>
  </Dialog>
);

const PasteForm = ({ onOpenChange }: Pick<Props, "onOpenChange">) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [text, setText] = useState("");

  const items = useMemo(
    () =>
      parseLedgerNotifications(text, todayKst()).map((item) => ({
        ...item,
        categoryName: suggestLedgerCategoryName(item.memo, item.kind),
      })),
    [text]
  );

  const register = useMutation({
    mutationFn: () =>
      ledgerRequest<{ created: number; skipped: number }>(
        token,
        "/api/ledger/entries/bulk",
        { method: "POST", body: { entries: items } }
      ),
    onSuccess: ({ created, skipped }) => {
      toast.success(
        skipped
          ? `${created}건 등록, 이미 있는 ${skipped}건은 건너뛰었어요.`
          : `${created}건 등록했어요.`
      );
      queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-3">
      <Textarea
        aria-label="은행 알림 내용"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={
          "11/08 15:52 출금 12,000원 스타벅스\n\n11/08 18:41 입금 50,000원 용돈"
        }
        className="min-h-28"
      />

      {text.trim() && (
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">
            {items.length ? `${items.length}건을 찾았어요` : "금액을 찾지 못했어요"}
          </p>
          {items.length > 0 && (
            <ul className="mt-1 divide-y divide-border">
              {items.map((item, index) => (
                <li key={index} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-foreground">
                      {item.memo || (item.kind === "income" ? "입금" : "지출")}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[
                        formatDayKo(item.entryDate),
                        item.entryTime,
                        item.kind === "expense" && (item.categoryName ?? "분류 없음"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-medium text-foreground tabular-nums">
                    {item.kind === "income" ? "+" : "-"}
                    {formatWon(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          취소
        </Button>
        <Button
          type="button"
          disabled={!items.length || register.isPending}
          onClick={() => register.mutate()}
        >
          {items.length ? `${items.length}건 등록` : "등록"}
        </Button>
      </div>
    </div>
  );
};
