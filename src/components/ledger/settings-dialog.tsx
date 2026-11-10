"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CategoryIcon } from "@/components/ledger/category-icon";
import { CategoryColorSwatches, IconPickerDialog } from "@/components/ledger/icon-picker";
import { AssetsTab, SubcategoriesTab } from "@/components/ledger/settings-extra";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/auth-store";
import type {
  LedgerCategoryInput,
  LedgerEntryKind,
  LedgerEntryView,
  LedgerHistoryItem,
  LedgerMonthPayload,
} from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import { ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatMonthKo, formatWon, shiftMonth } from "@/lib/ledger/format";
import {
  defaultCategoryColor,
  suggestCategoryIcon,
  type LedgerCategoryColorKey,
  type LedgerCategoryIconKey,
} from "@/lib/ledger/icons";
import { cn } from "@/lib/utils";

type CategoryKind = Exclude<LedgerEntryKind, "transfer">;

const TABS = [
  { id: "budget", label: "예산" },
  { id: "categories", label: "분류" },
  { id: "subcategories", label: "소분류" },
  { id: "assets", label: "결제수단" },
  { id: "account", label: "통장" },
  { id: "data", label: "기록" },
] as const;

export type LedgerSettingsTab = (typeof TABS)[number]["id"];

const HISTORY_ACTION_LABEL: Record<LedgerHistoryItem["action"], string> = {
  create: "추가",
  update: "수정",
  delete: "삭제",
  restore: "복구",
};

const roundToThousand = (value: number) => Math.round(value / 1000) * 1000;

const numberDisplay = (digits: string) =>
  digits ? Number(digits).toLocaleString("ko-KR") : "";

const cleanDigits = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

type CategoryDraft = {
  name: string;
  icon: LedgerCategoryIconKey;
  color: LedgerCategoryColorKey;
  iconTouched: boolean;
  colorTouched: boolean;
};

const emptyCategoryDraft = (): CategoryDraft => ({
  name: "",
  icon: "tag",
  color: "neutral",
  iconTouched: false,
  colorTouched: false,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: LedgerMonthPayload;
  initialTab: LedgerSettingsTab;
}

export const SettingsDialog = ({ open, onOpenChange, ledger, initialTab }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>예산·설정</DialogTitle>
        <DialogDescription>예산과 분류, 잔액을 관리해요.</DialogDescription>
      </DialogHeader>
      <SettingsBody ledger={ledger} initialTab={initialTab} />
    </DialogContent>
  </Dialog>
);

const AccountTab = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const { account } = ledger;
  const [actual, setActual] = useState("");
  const [opening, setOpening] = useState(String(account.openingBalance));

  const save = useMutation({
    mutationFn: (body: { actualBalance: number } | { openingBalance: number }) =>
      ledgerRequest(token, "/api/ledger/account", { method: "PUT", body }),
    onSuccess: () => {
      toast.success("잔액을 저장했어요.");
      setActual("");
      queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const difference = actual ? Number(actual) - account.currentBalance : 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-muted/70 p-3">
        <p className="text-[11px] text-muted-foreground">가계부 기준 현재 잔액</p>
        <p className="mt-0.5 text-xl font-semibold text-foreground tabular-nums">
          {formatWon(account.currentBalance)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {account.checkedAt && account.checkedBalance != null
            ? `${kst(account.checkedAt).format("M월 D일 HH:mm")}에 ${formatWon(account.checkedBalance)}으로 맞췄어요`
            : account.baseDate
              ? `${account.baseDate.replaceAll("-", ".")} 까지의 내역은 잔액에 넣지 않아요. 실제 잔액을 입력해 주세요`
              : "아직 실제 통장과 맞춘 적이 없어요"}
        </p>
      </div>

      <div>
        <label
          className="text-[12px] font-medium text-muted-foreground"
          htmlFor="ledger-actual"
        >
          실제 통장 잔액
        </label>
        <div className="mt-1 flex gap-2">
          <Input
            id="ledger-actual"
            value={numberDisplay(actual)}
            onChange={(event) => setActual(cleanDigits(event.target.value).slice(0, 10))}
            inputMode="numeric"
            placeholder="은행 앱의 잔액"
            className="text-right tabular-nums"
          />
          <Button
            type="button"
            disabled={!actual || save.isPending}
            onClick={() => save.mutate({ actualBalance: Number(actual) })}
          >
            맞추기
          </Button>
        </div>
        {actual && (
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {difference === 0
              ? "가계부와 잔액이 같아요"
              : `가계부보다 ${formatWon(Math.abs(difference))} ${difference > 0 ? "많아요" : "적어요"} · 맞추면 오늘부터 다시 계산해요`}
          </p>
        )}
      </div>

      <div>
        <label
          className="text-[12px] font-medium text-muted-foreground"
          htmlFor="ledger-opening"
        >
          기준 잔액
        </label>
        <div className="mt-1 flex gap-2">
          <Input
            id="ledger-opening"
            value={numberDisplay(opening)}
            onChange={(event) => setOpening(cleanDigits(event.target.value).slice(0, 10))}
            inputMode="numeric"
            placeholder="0"
            className="text-right tabular-nums"
          />
          <Button
            type="button"
            variant="outline"
            disabled={
              !opening || Number(opening) === account.openingBalance || save.isPending
            }
            onClick={() => save.mutate({ openingBalance: Number(opening) })}
          >
            저장
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {account.baseDate
            ? `${account.baseDate.replaceAll("-", ".")} 기준으로 통장에 있던 돈이에요.`
            : "첫 기록 이전에 통장에 있던 돈이에요."}
        </p>
      </div>
    </div>
  );
};

type LedgerTrip = LedgerMonthPayload["trips"][number];

const TripForm = ({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  bare = false,
}: {
  initial?: LedgerTrip;
  /** 이미 카드 안에 있으면 폼 테두리를 생략한다. */
  bare?: boolean;
  submitLabel: string;
  pending: boolean;
  onSubmit: (input: { name: string; startDate: string; endDate: string }) => void;
  onCancel?: () => void;
}) => {
  const [name, setName] = useState(initial?.name ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const ready = name.trim() && startDate && endDate;

  return (
    <div className={cn("space-y-2", !bare && "rounded-xl border border-border p-2.5")}>
      <Input
        aria-label="여행 이름"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="예: 2026 제주"
        maxLength={30}
      />
      <div className="grid grid-cols-2 gap-2">
        <DatePicker
          aria-label="여행 시작일"
          value={startDate}
          onChange={setStartDate}
          placeholder="시작일"
        />
        <DatePicker
          aria-label="여행 종료일"
          value={endDate}
          onChange={setEndDate}
          placeholder="종료일"
        />
      </div>
      <div className="flex justify-end gap-1.5">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!ready || pending}
          onClick={() => onSubmit({ name, startDate, endDate })}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
};

const TripCandidates = ({ trip, onDone }: { trip: LedgerTrip; onDone: () => void }) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [unchecked, setUnchecked] = useState<Set<number>>(() => new Set());

  const candidates = useQuery({
    queryKey: ledgerKeys.tripCandidates(trip.id),
    queryFn: async () => {
      const data = await ledgerRequest<{ entries: LedgerEntryView[] }>(
        token,
        `/api/ledger/trips/entries?tripId=${trip.id}`
      );
      return data.entries;
    },
    enabled: Boolean(token),
  });

  const selectedIds = (candidates.data ?? [])
    .map((entry) => entry.id)
    .filter((id) => !unchecked.has(id));

  const attach = useMutation({
    mutationFn: () =>
      ledgerRequest(token, "/api/ledger/trips/entries", {
        method: "POST",
        body: { tripId: trip.id, entryIds: selectedIds },
      }),
    onSuccess: () => {
      toast.success(`${selectedIds.length}건을 연결했어요.`);
      queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (candidates.isPending) {
    return (
      <p className="py-3 text-center text-[12px] text-muted-foreground">불러오는 중…</p>
    );
  }
  if (!candidates.data?.length) {
    return (
      <p className="py-3 text-center text-[12px] text-muted-foreground">
        기간 안에 연결할 지출이 없어요. 미리 결제한 내역은 내역 수정에서 여행을 골라
        주세요.
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-border p-2.5">
      <ul aria-label={`${trip.name} 연결 후보`} className="space-y-1.5">
        {candidates.data.map((entry) => (
          <li key={entry.id}>
            <label className="flex items-center gap-2 text-[12px] text-foreground">
              <input
                type="checkbox"
                checked={!unchecked.has(entry.id)}
                onChange={(event) =>
                  setUnchecked((prev) => {
                    const next = new Set(prev);
                    if (event.target.checked) next.delete(entry.id);
                    else next.add(entry.id);
                    return next;
                  })
                }
              />
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {entry.entryDate.slice(5).replace("-", ".")}
              </span>
              <span className="min-w-0 flex-1 truncate">{entry.memo || "지출"}</span>
              <span className="shrink-0 tabular-nums">{formatWon(entry.amount)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!selectedIds.length || attach.isPending}
          onClick={() => attach.mutate()}
        >
          {selectedIds.length}건 연결
        </Button>
      </div>
    </div>
  );
};

/** 여행 탭: 여행 목록 카드와 여행 추가 카드. */
export const TripsTab = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ledgerKeys.all });

  const create = useMutation({
    mutationFn: (body: { name: string; startDate: string; endDate: string }) =>
      ledgerRequest(token, "/api/ledger/trips", { method: "POST", body }),
    onSuccess: () => {
      toast.success("여행을 추가했어요.");
      setFormKey((key) => key + 1);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: (body: {
      id: number;
      name: string;
      startDate: string;
      endDate: string;
    }) => ledgerRequest(token, "/api/ledger/trips", { method: "PATCH", body }),
    onSuccess: () => {
      toast.success("여행을 수정했어요.");
      setEditingId(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      ledgerRequest(token, "/api/ledger/trips", { method: "DELETE", body: { id } }),
    onSuccess: () => {
      toast.success("여행을 삭제했어요.");
      setDeletingId(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const tripList = (
    <ul className="divide-y divide-border">
      {ledger.trips.map((trip) => (
        <li key={trip.id} className="py-2">
          {editingId === trip.id ? (
            <TripForm
              initial={trip}
              submitLabel="저장"
              pending={update.isPending}
              onSubmit={(input) => update.mutate({ id: trip.id, ...input })}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {trip.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {trip.startDate.replaceAll("-", ".")} ~{" "}
                    {trip.endDate.slice(5).replace("-", ".")} · {trip.entryCount}건 ·{" "}
                    {formatWon(trip.expense)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${trip.name} 수정`}
                  onClick={() => setEditingId(trip.id)}
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${trip.name} 삭제`}
                  onClick={() => setDeletingId(trip.id)}
                >
                  <Trash2 />
                </Button>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => setLinkingId(linkingId === trip.id ? null : trip.id)}
              >
                기간 내역 연결
              </Button>
              {linkingId === trip.id && (
                <TripCandidates trip={trip} onDone={() => setLinkingId(null)} />
              )}

              {deletingId === trip.id && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-border p-2.5 text-[12px] text-foreground">
                  <span className="flex-1">여행만 지워지고 내역은 남아요.</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingId(null)}
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(trip.id)}
                  >
                    여행 삭제
                  </Button>
                </div>
              )}
            </>
          )}
        </li>
      ))}
      {!ledger.trips.length && (
        <li className="py-4 text-center text-[12px] text-muted-foreground">
          등록된 여행이 없어요
        </li>
      )}
    </ul>
  );

  const tripForm = (
    <TripForm
      key={formKey}
      submitLabel="여행 추가"
      bare
      pending={create.isPending}
      onSubmit={(input) => create.mutate(input)}
    />
  );

  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 [&>*]:min-w-0">
      <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h3 className="text-[12px] font-medium text-muted-foreground">여행</h3>
        {tripList}
      </section>
      <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h3 className="mb-2 text-[12px] font-medium text-muted-foreground">여행 추가</h3>
        {tripForm}
      </section>
    </div>
  );
};

const DataTab = () => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const history = useQuery({
    queryKey: ledgerKeys.history,
    queryFn: async () => {
      const data = await ledgerRequest<{ history: LedgerHistoryItem[] }>(
        token,
        "/api/ledger/history"
      );
      return data.history;
    },
    enabled: Boolean(token),
  });

  const restore = useMutation({
    mutationFn: (id: number) =>
      ledgerRequest(token, "/api/ledger/entries/restore", {
        method: "POST",
        body: { id },
      }),
    onSuccess: () => {
      toast.success("기록을 되돌렸어요.");
      queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const download = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ledger/export", {
        headers: { "x-auth-token": token },
      });
      if (!res.ok) throw new Error("내보내지 못했어요.");
      const url = URL.createObjectURL(await res.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ledger-${kst().format("YYYYMMDD")}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground">전체 내역 내보내기</p>
          <p className="text-[11px] text-muted-foreground">
            Excel에서 열 수 있는 CSV로 받아요.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={download.isPending}
          onClick={() => download.mutate()}
        >
          <Download /> CSV
        </Button>
      </div>

      <div>
        <p className="text-[12px] font-medium text-muted-foreground">최근 변경 이력</p>
        {history.isPending ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            불러오는 중…
          </p>
        ) : history.isError ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            이력을 불러오지 못했어요
          </p>
        ) : history.data.length ? (
          <ul className="mt-1 divide-y divide-border">
            {history.data.map((item) => (
              <li key={item.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-foreground">
                    {HISTORY_ACTION_LABEL[item.action]} ·{" "}
                    {item.memo ||
                      (item.kind === "income"
                        ? "입금"
                        : item.kind === "transfer"
                          ? "이체"
                          : "지출")}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground tabular-nums">
                    {kst(item.createdAt).format("M월 D일 HH:mm")}·{" "}
                    {formatWon(item.amount)}
                  </span>
                </span>
                {item.canRestore && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(item.entryId)}
                  >
                    <RotateCcw /> 되돌리기
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            아직 이력이 없어요
          </p>
        )}
      </div>
    </div>
  );
};

const SettingsBody = ({
  ledger,
  initialTab,
}: {
  ledger: LedgerMonthPayload;
  initialTab: LedgerSettingsTab;
}) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<LedgerSettingsTab>(initialTab);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ledgerKeys.all });

  const [totalBudget, setTotalBudget] = useState(
    ledger.budget.totalBudget == null ? "" : String(ledger.budget.totalBudget)
  );
  const [note, setNote] = useState(ledger.budget.note);
  const [categoryAmounts, setCategoryAmounts] = useState<Record<string, string>>(() => {
    const saved = new Map(
      ledger.budget.byCategory.map((row) => [row.categoryId, row.amount])
    );
    return Object.fromEntries(
      ledger.categories
        .filter((category) => category.kind === "expense")
        .map((category) => [String(category.id), String(saved.get(category.id) ?? "")])
    );
  });

  const allocatedCategoryBudget = ledger.categories
    .filter((category) => category.kind === "expense")
    .reduce(
      (sum, category) => sum + Number(categoryAmounts[String(category.id)] || 0),
      0
    );
  const totalBudgetNumber = totalBudget ? Number(totalBudget) : null;

  const { expenseReference } = ledger;
  const referenceByCategory = new Map(
    expenseReference.byCategory.map((row) => [
      row.categoryId,
      roundToThousand(row.average),
    ])
  );

  const fillBudgetFromAverage = () => {
    if (expenseReference.average == null) return;
    setTotalBudget(String(roundToThousand(expenseReference.average)));
    setCategoryAmounts(
      Object.fromEntries(
        ledger.categories
          .filter((category) => category.kind === "expense")
          .map((category) => [
            String(category.id),
            String(referenceByCategory.get(category.id) || ""),
          ])
      )
    );
    toast.success("최근 평균으로 채웠어요. 저장하면 적용돼요.");
  };

  const saveBudget = useMutation({
    mutationFn: () => {
      const body = {
        month: ledger.month,
        totalBudget: totalBudget ? Number(totalBudget) : null,
        note,
        categories: ledger.categories
          .filter((category) => category.kind === "expense")
          .map((category) => ({
            categoryId: category.id,
            amount: Number(categoryAmounts[String(category.id)] || 0),
          }))
          .filter((row) => row.amount > 0),
      };
      return ledgerRequest(token, "/api/ledger/budget", { method: "PUT", body });
    },
    onSuccess: () => {
      toast.success("예산을 저장했어요.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copyPreviousBudget = useMutation({
    mutationFn: async () => {
      const previous = shiftMonth(ledger.month, -1);
      const data = await ledgerRequest<{ ledger: LedgerMonthPayload }>(
        token,
        `/api/ledger?month=${previous}`
      );
      return { previous, budget: data.ledger.budget };
    },
    onSuccess: ({ previous, budget }) => {
      if (budget.totalBudget == null && !budget.byCategory.length) {
        toast.error(`${formatMonthKo(previous)} 예산이 없어요.`);
        return;
      }
      setTotalBudget(budget.totalBudget == null ? "" : String(budget.totalBudget));
      setCategoryAmounts(
        Object.fromEntries(
          ledger.categories
            .filter((category) => category.kind === "expense")
            .map((category) => [
              String(category.id),
              String(
                budget.byCategory.find((row) => row.categoryId === category.id)?.amount ??
                  ""
              ),
            ])
        )
      );
      toast.success(`${formatMonthKo(previous)} 예산을 불러왔어요. 저장하면 적용돼요.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [categoryDraft, setCategoryDraft] = useState<Record<CategoryKind, CategoryDraft>>(
    {
      expense: emptyCategoryDraft(),
      income: emptyCategoryDraft(),
    }
  );

  const createCategory = useMutation({
    mutationFn: (input: LedgerCategoryInput) =>
      ledgerRequest(token, "/api/ledger/categories", { method: "POST", body: input }),
    onSuccess: (_data, input) => {
      toast.success("분류를 추가했어요.");
      setCategoryDraft((prev) => ({
        ...prev,
        [input.kind]: emptyCategoryDraft(),
      }));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [deleting, setDeleting] = useState<{
    id: number;
    moveToId: number | null;
  } | null>(null);

  const deleteCategory = useMutation({
    mutationFn: (input: { id: number; moveToId: number | null }) =>
      ledgerRequest(token, "/api/ledger/categories", { method: "DELETE", body: input }),
    onSuccess: () => {
      toast.success("분류를 삭제했어요.");
      setDeleting(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryEdit, setCategoryEdit] = useState<{
    name: string;
    icon: LedgerCategoryIconKey;
    color: LedgerCategoryColorKey;
  }>({ name: "", icon: "tag", color: "neutral" });
  const [iconPicker, setIconPicker] = useState<{
    target: "create" | "edit";
    kind: CategoryKind;
    value: LedgerCategoryIconKey;
  } | null>(null);

  const updateCategory = useMutation({
    mutationFn: (input: {
      id: number;
      name: string;
      icon: LedgerCategoryIconKey;
      color: LedgerCategoryColorKey;
    }) =>
      ledgerRequest(token, "/api/ledger/categories", { method: "PATCH", body: input }),
    onSuccess: () => {
      toast.success("분류를 수정했어요.");
      setEditingCategoryId(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startEditCategory = (category: LedgerMonthPayload["categories"][number]) => {
    setEditingCategoryId(category.id);
    setCategoryEdit({
      name: category.name,
      icon: category.icon,
      color: category.color,
    });
  };

  const saveCategory = () => {
    if (editingCategoryId == null || !categoryEdit.name.trim()) return;
    updateCategory.mutate({
      id: editingCategoryId,
      name: categoryEdit.name,
      icon: categoryEdit.icon,
      color: categoryEdit.color,
    });
  };

  const selectCategoryIcon = (icon: LedgerCategoryIconKey) => {
    if (!iconPicker) return;
    if (iconPicker.target === "create") {
      setCategoryDraft((prev) => {
        const current = prev[iconPicker.kind];
        return {
          ...prev,
          [iconPicker.kind]: {
            ...current,
            icon,
            color: current.colorTouched ? current.color : defaultCategoryColor(icon),
            iconTouched: true,
          },
        };
      });
    } else {
      setCategoryEdit((prev) => ({ ...prev, icon }));
    }
    setIconPicker(null);
  };

  const addCategory = (kind: CategoryKind) => {
    const draft = categoryDraft[kind];
    if (!draft.name.trim()) return;
    createCategory.mutate({
      name: draft.name,
      kind,
      icon: draft.icon,
      color: draft.color,
    });
  };

  const updateCategoryDraftName = (kind: CategoryKind, name: string) => {
    setCategoryDraft((prev) => {
      const current = prev[kind];
      const next = { ...current, name };
      if (!current.iconTouched) {
        const icon = suggestCategoryIcon(name);
        next.icon = icon;
        if (!current.colorTouched) next.color = defaultCategoryColor(icon);
      }
      return { ...prev, [kind]: next };
    });
  };

  const categorySections: { kind: CategoryKind; label: string }[] = [
    { kind: "expense", label: "지출" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap rounded-lg bg-muted p-[3px]">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
              tab === option.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === "budget" && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                className="text-[12px] font-medium text-muted-foreground"
                htmlFor="ledger-total-budget"
              >
                {formatMonthKo(ledger.month)} 총 예산
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={copyPreviousBudget.isPending}
                onClick={() => copyPreviousBudget.mutate()}
              >
                지난달 예산 불러오기
              </Button>
            </div>
            <div className="relative mt-1">
              <Input
                id="ledger-total-budget"
                value={numberDisplay(totalBudget)}
                onChange={(event) =>
                  setTotalBudget(cleanDigits(event.target.value).slice(0, 10))
                }
                inputMode="numeric"
                placeholder="0"
                className="pr-8 text-right tabular-nums"
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-muted-foreground">
                원
              </span>
            </div>
            {expenseReference.average != null && (
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  최근 {expenseReference.months}개월 평균 지출{" "}
                  {formatWon(expenseReference.average)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={fillBudgetFromAverage}
                >
                  평균으로 채우기
                </Button>
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <p className="text-[12px] font-medium text-muted-foreground">분류별 예산</p>
              <span
                className={`text-[10.5px] tabular-nums ${
                  totalBudgetNumber != null && allocatedCategoryBudget > totalBudgetNumber
                    ? "text-[color:var(--destructive)]"
                    : "text-muted-foreground"
                }`}
              >
                {totalBudgetNumber != null && allocatedCategoryBudget > totalBudgetNumber
                  ? `${formatWon(allocatedCategoryBudget - totalBudgetNumber)} 초과 배분`
                  : `분류 합계 ${formatWon(allocatedCategoryBudget)}${
                      totalBudgetNumber != null
                        ? ` · 미배분 ${formatWon(Math.max(totalBudgetNumber - allocatedCategoryBudget, 0))}`
                        : ""
                    }`}
              </span>
            </div>
            <div className="mt-1 divide-y divide-border">
              {ledger.categories
                .filter((category) => category.kind === "expense")
                .map((category) => {
                  const spent =
                    ledger.byCategory.find((row) => row.categoryId === category.id)
                      ?.amount ?? 0;
                  const planned = Number(categoryAmounts[String(category.id)] || 0);
                  const remaining = planned - spent;
                  const over = planned > 0 && remaining < 0;
                  const pct = planned > 0 ? Math.min((spent / planned) * 100, 100) : 0;

                  return (
                    <div key={category.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <CategoryIcon
                          icon={category.icon}
                          color={category.color}
                          size={28}
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                          {category.name}
                        </span>
                        <div className="relative w-28">
                          <Input
                            aria-label={`${category.name} 예산`}
                            value={numberDisplay(
                              categoryAmounts[String(category.id)] ?? ""
                            )}
                            onChange={(event) =>
                              setCategoryAmounts((prev) => ({
                                ...prev,
                                [String(category.id)]: cleanDigits(
                                  event.target.value
                                ).slice(0, 10),
                              }))
                            }
                            inputMode="numeric"
                            placeholder={numberDisplay(
                              String(referenceByCategory.get(category.id) ?? 0)
                            )}
                            className="pr-6 text-right tabular-nums"
                          />
                          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-muted-foreground">
                            원
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 pr-1 pl-9">
                        <div className="flex items-center justify-between gap-2 text-[10.5px] tabular-nums">
                          <span className="text-muted-foreground">
                            지출 {formatWon(spent)}
                          </span>
                          {planned > 0 ? (
                            <span
                              className={
                                over
                                  ? "text-[color:var(--destructive)]"
                                  : "text-muted-foreground"
                              }
                            >
                              {over
                                ? `${formatWon(Math.abs(remaining))} 초과`
                                : `${formatWon(remaining)} 남음`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">예산 미설정</span>
                          )}
                        </div>
                        {planned > 0 && (
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${
                                over ? "bg-[var(--destructive)]" : "bg-primary"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
            {ledger.budget.totalBudget != null && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                지금까지 {formatWon(ledger.summary.expense)} 썼어요
              </p>
            )}
          </div>

          <div>
            <label
              className="text-[12px] font-medium text-muted-foreground"
              htmlFor="ledger-budget-note"
            >
              월 메모
            </label>
            <Textarea
              id="ledger-budget-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="이 달의 예산 메모"
              className="mt-1 min-h-16"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => saveBudget.mutate()} disabled={saveBudget.isPending}>
              저장
            </Button>
          </div>
        </div>
      )}

      {tab === "categories" && (
        <div className="space-y-5">
          {categorySections.map((section) => {
            const categories = ledger.categories.filter(
              (category) => category.kind === section.kind
            );
            const draft = categoryDraft[section.kind];
            const isLast = categories.length <= 1;

            return (
              <section key={section.kind}>
                <div className="flex items-center justify-between">
                  <h3 className="text-[12px] font-medium text-muted-foreground">
                    {section.label}
                  </h3>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {categories.length}개
                  </span>
                </div>
                <ul className="mt-1 divide-y divide-border">
                  {categories.map((category) => (
                    <li key={category.id} className="py-1.5">
                      {editingCategoryId === category.id ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={`${category.name} 아이콘`}
                              onClick={() =>
                                setIconPicker({
                                  target: "edit",
                                  kind: section.kind,
                                  value: categoryEdit.icon,
                                })
                              }
                              className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              <CategoryIcon
                                icon={categoryEdit.icon}
                                color={categoryEdit.color}
                                size={30}
                              />
                            </button>
                            <Input
                              value={categoryEdit.name}
                              onChange={(event) =>
                                setCategoryEdit((prev) => ({
                                  ...prev,
                                  name: event.target.value,
                                }))
                              }
                              aria-label={`${category.name} 이름`}
                              autoFocus
                              className="min-w-0 flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="분류 수정 저장"
                              disabled={
                                !categoryEdit.name.trim() || updateCategory.isPending
                              }
                              onClick={saveCategory}
                            >
                              <Check />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="분류 수정 취소"
                              onClick={() => setEditingCategoryId(null)}
                            >
                              <X />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2 pl-10">
                            <span className="text-[10px] text-muted-foreground">색</span>
                            <CategoryColorSwatches
                              value={categoryEdit.color}
                              onChange={(color) =>
                                setCategoryEdit((prev) => ({ ...prev, color }))
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <CategoryIcon
                            icon={category.icon}
                            color={category.color}
                            size={28}
                          />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                            {category.name}
                          </span>
                          <Tooltip>
                            <TooltipTrigger render={<span className="inline-flex" />}>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`${category.name} 수정`}
                                onClick={() => startEditCategory(category)}
                              >
                                <Pencil />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>분류 수정</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger render={<span className="inline-flex" />}>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`${category.name} 삭제`}
                                disabled={isLast || deleteCategory.isPending}
                                onClick={() =>
                                  setDeleting({ id: category.id, moveToId: null })
                                }
                              >
                                <Trash2 />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {isLast ? "분류는 최소 하나 필요해요" : "분류 삭제"}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                      {deleting?.id === category.id && (
                        <div className="mt-2 space-y-2 rounded-xl border border-border p-2.5">
                          <p className="text-[12px] text-foreground">
                            {category.entryCount
                              ? `내역 ${category.entryCount}건을 옮길 분류를 골라 주세요. 이 분류의 월별 예산은 삭제돼요.`
                              : "이 분류를 삭제할까요? 월별 예산도 함께 삭제돼요."}
                          </p>
                          {category.entryCount > 0 && (
                            <Select
                              items={categories
                                .filter((option) => option.id !== category.id)
                                .map((option) => ({
                                  value: String(option.id),
                                  label: option.name,
                                }))}
                              value={
                                deleting.moveToId == null
                                  ? null
                                  : String(deleting.moveToId)
                              }
                              onValueChange={(value) =>
                                setDeleting({
                                  id: category.id,
                                  moveToId: value == null ? null : Number(value),
                                })
                              }
                            >
                              <SelectTrigger className="w-full" aria-label="옮길 분류">
                                <SelectValue placeholder="옮길 분류 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {categories
                                  .filter((option) => option.id !== category.id)
                                  .map((option) => (
                                    <SelectItem key={option.id} value={String(option.id)}>
                                      {option.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          )}
                          <div className="flex justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleting(null)}
                            >
                              취소
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={
                                deleteCategory.isPending ||
                                (category.entryCount > 0 && deleting.moveToId == null)
                              }
                              onClick={() => deleteCategory.mutate(deleting)}
                            >
                              {category.entryCount ? "옮기고 삭제" : "삭제"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 rounded-xl border border-border p-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`${section.label} 분류 아이콘`}
                      onClick={() =>
                        setIconPicker({
                          target: "create",
                          kind: section.kind,
                          value: draft.icon,
                        })
                      }
                      className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <CategoryIcon icon={draft.icon} color={draft.color} size={30} />
                    </button>
                    <Input
                      value={draft.name}
                      onChange={(event) =>
                        updateCategoryDraftName(section.kind, event.target.value)
                      }
                      placeholder="이름"
                      aria-label={`${section.label} 분류 이름`}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => addCategory(section.kind)}
                      disabled={!draft.name.trim() || createCategory.isPending}
                    >
                      추가
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">색</span>
                    <CategoryColorSwatches
                      value={draft.color}
                      onChange={(color) =>
                        setCategoryDraft((prev) => ({
                          ...prev,
                          [section.kind]: {
                            ...prev[section.kind],
                            color,
                            colorTouched: true,
                          },
                        }))
                      }
                    />
                  </div>
                  {draft.name.trim() && !draft.iconTouched ? (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      이름에 맞는 아이콘을 자동으로 골랐어요
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === "account" && <AccountTab ledger={ledger} />}

      {tab === "data" && <DataTab />}

      {tab === "subcategories" && <SubcategoriesTab ledger={ledger} />}

      {tab === "assets" && <AssetsTab ledger={ledger} />}

      <IconPickerDialog
        open={iconPicker != null}
        onOpenChange={(open) => {
          if (!open) setIconPicker(null);
        }}
        value={iconPicker?.value ?? "tag"}
        onSelect={selectCategoryIcon}
      />
    </div>
  );
};
