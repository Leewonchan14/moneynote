"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, PiggyBank, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/lib/auth-store";
import type { LedgerMonthPayload, LedgerSavingsView } from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import { ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatWon, todayKst } from "@/lib/ledger/format";

const dotted = (date: string | null) => date?.replaceAll("-", ".") ?? "";

const cleanDigits = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

/** 가입일·만기일을 모두 알 때 만기까지 지난 기간의 비율. */
const elapsedPct = (product: LedgerSavingsView): number | null => {
  if (!product.startDate || !product.endDate) return null;
  const start = kst(product.startDate);
  const total = kst(product.endDate).diff(start, "day");
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, (kst(todayKst()).diff(start, "day") / total) * 100));
};

const SavingsCard = ({
  product,
  onEdit,
}: {
  product: LedgerSavingsView;
  onEdit: () => void;
}) => {
  const pct = elapsedPct(product);
  const period = product.endDate
    ? `${dotted(product.startDate ?? product.firstDate)} ~ ${dotted(product.endDate)}`
    : product.firstDate
      ? `${dotted(product.firstDate)}부터`
      : "납입 내역 없음";

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-foreground">
              {product.name}
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              {period}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${product.name} 수정`}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
        </div>
        <p className="text-xl font-semibold text-foreground tabular-nums">
          {formatWon(product.total)}
        </p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {[
            `납입 ${product.count}회`,
            product.lastDate && `최근 ${dotted(product.lastDate)}`,
            product.monthlyAmount && `월 ${formatWon(product.monthlyAmount)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {pct != null && (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
              만기까지 {Math.round(pct)}% 지남
            </p>
          </div>
        )}
        {product.memo && (
          <p className="text-[11px] whitespace-pre-wrap text-muted-foreground">
            {product.memo}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const SavingsForm = ({
  product,
  onClose,
}: {
  product: LedgerSavingsView | null;
  onClose: () => void;
}) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [name, setName] = useState(product?.name ?? "");
  const [startDate, setStartDate] = useState(product?.startDate ?? "");
  const [endDate, setEndDate] = useState(product?.endDate ?? "");
  const [monthly, setMonthly] = useState(
    product?.monthlyAmount ? String(product.monthlyAmount) : ""
  );
  const [memo, setMemo] = useState(product?.memo ?? "");

  const done = (message: string) => {
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        startDate: startDate || null,
        endDate: endDate || null,
        monthlyAmount: monthly ? Number(monthly) : null,
        memo: memo.trim(),
      };
      return ledgerRequest(token, "/api/ledger/savings", {
        method: product ? "PATCH" : "POST",
        body: product ? { id: product.id, ...body } : body,
      });
    },
    onSuccess: () => done("저축 상품을 저장했어요."),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () =>
      ledgerRequest(token, "/api/ledger/savings", {
        method: "DELETE",
        body: { id: product?.id },
      }),
    onSuccess: () => done("저축 상품을 삭제했어요."),
    onError: (error: Error) => toast.error(error.message),
  });

  const fieldClass = "text-[12px] font-medium text-muted-foreground";

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <label className={fieldClass} htmlFor="savings-name">
          상품 이름
        </label>
        <Input
          id="savings-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          placeholder="예: 청년미래적금"
          className="mt-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={fieldClass} htmlFor="savings-start">
            가입일
          </label>
          <DatePicker
            id="savings-start"
            value={startDate}
            onChange={setStartDate}
            placeholder="가입일"
            className="mt-1"
          />
        </div>
        <div>
          <label className={fieldClass} htmlFor="savings-end">
            만기일
          </label>
          <DatePicker
            id="savings-end"
            value={endDate}
            onChange={setEndDate}
            placeholder="만기일"
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <label className={fieldClass} htmlFor="savings-monthly">
          월 납입액
        </label>
        <Input
          id="savings-monthly"
          value={monthly ? Number(monthly).toLocaleString("ko-KR") : ""}
          onChange={(event) => setMonthly(cleanDigits(event.target.value).slice(0, 10))}
          inputMode="numeric"
          placeholder="0"
          className="mt-1 text-right tabular-nums"
        />
      </div>
      <div>
        <label className={fieldClass} htmlFor="savings-memo">
          메모
        </label>
        <Textarea
          id="savings-memo"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          maxLength={2000}
          rows={2}
          className="mt-1"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          {product && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              삭제
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={!name.trim() || save.isPending}>
            저장
          </Button>
        </div>
      </div>
    </form>
  );
};

export const SavingsView = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const [editing, setEditing] = useState<LedgerSavingsView | "new" | null>(null);
  const total = ledger.savings.reduce((sum, product) => sum + product.total, 0);
  const close = () => setEditing(null);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-muted-foreground">저축한 금액</p>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {formatWon(total)}
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus /> 상품 추가
        </Button>
      </div>

      {ledger.savings.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {ledger.savings.map((product) => (
            <SavingsCard
              key={product.id}
              product={product}
              onEdit={() => setEditing(product)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <PiggyBank className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">
              저축 상품이 아직 없어요
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              상품을 추가하면 이체 내역이 여기에 쌓여요.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "저축 상품 추가" : "저축 상품 수정"}
            </DialogTitle>
            <DialogDescription>납입은 내역에서 이체로 기록해요.</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <SavingsForm
              key={editing === "new" ? "new" : editing.id}
              product={editing === "new" ? null : editing}
              onClose={close}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
