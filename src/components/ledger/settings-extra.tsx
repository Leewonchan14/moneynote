"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/lib/auth-store";
import type {
  LedgerEntryKind,
  LedgerMonthPayload,
  LedgerRecurringView,
} from "@/lib/db/ledger";
import type { LedgerRecurringCandidate } from "@/lib/db/ledger-extras";
import { kst } from "@/lib/kst";
import { ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatWon, todayKst } from "@/lib/ledger/format";
import { cn } from "@/lib/utils";

type Method = "POST" | "PATCH" | "DELETE";

const useLedgerAction = () => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return async (path: string, method: Method, body: unknown, success: string) => {
    try {
      await ledgerRequest(token, path, { method, body });
      toast.success(success);
      await queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "저장하지 못했어요.");
      return false;
    }
  };
};

const cleanDigits = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

type NamedItem = { id: number; name: string; entryCount: number };

const NamedRow = ({
  item,
  onRename,
  onDelete,
}: {
  item: NamedItem;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (draft !== null) {
    return (
      <li className="flex items-center gap-1.5 py-1.5">
        <Input
          value={draft}
          aria-label={`${item.name} 새 이름`}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={40}
          autoFocus
        />
        <Button
          type="button"
          size="icon-sm"
          aria-label="이름 저장"
          disabled={!draft.trim()}
          onClick={async () => {
            if (await onRename(draft.trim())) setDraft(null);
          }}
        >
          <Check />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="취소"
          onClick={() => setDraft(null)}
        >
          <X />
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1.5 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
        {item.name}
      </span>
      {confirming ? (
        <>
          <span className="text-[11px] text-destructive">
            {item.entryCount > 0 ? `내역 ${item.entryCount}건에서 비워져요` : "지울까요?"}
          </span>
          <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
            삭제
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            취소
          </Button>
        </>
      ) : (
        <>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {item.entryCount}건
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${item.name} 이름 수정`}
            onClick={() => setDraft(item.name)}
          >
            <Pencil />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${item.name} 삭제`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
          </Button>
        </>
      )}
    </li>
  );
};

const NamedListEditor = ({
  items,
  placeholder,
  emptyText,
  onAdd,
  onRename,
  onDelete,
}: {
  items: NamedItem[];
  placeholder: string;
  emptyText: string;
  onAdd: (name: string) => Promise<boolean>;
  onRename: (id: number, name: string) => Promise<boolean>;
  onDelete: (id: number) => void;
}) => {
  const [name, setName] = useState("");

  return (
    <div className="space-y-2">
      {items.length ? (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <NamedRow
              key={item.id}
              item={item}
              onRename={(next) => onRename(item.id, next)}
              onDelete={() => onDelete(item.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="py-3 text-center text-[12px] text-muted-foreground">{emptyText}</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (name.trim() && (await onAdd(name.trim()))) setName("");
        }}
      >
        <Input
          value={name}
          aria-label={placeholder}
          onChange={(event) => setName(event.target.value)}
          placeholder={placeholder}
          maxLength={40}
        />
        <Button type="submit" variant="outline" disabled={!name.trim()}>
          <Plus /> 추가
        </Button>
      </form>
    </div>
  );
};

export const SubcategoriesTab = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const run = useLedgerAction();
  const categories = ledger.categories.filter((category) => category.kind === "expense");
  const [chosen, setChosen] = useState<number | null>(null);
  const categoryId = chosen ?? categories[0]?.id ?? null;
  const path = "/api/ledger/subcategories";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            aria-pressed={category.id === categoryId}
            onClick={() => setChosen(category.id)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[12px] transition-colors",
              category.id === categoryId && "border-primary bg-muted ring-1 ring-primary",
              category.id !== categoryId && "border-border bg-card hover:bg-muted"
            )}
          >
            {category.name}
          </button>
        ))}
      </div>
      {categoryId != null && (
        <NamedListEditor
          key={categoryId}
          items={ledger.subcategories.filter((row) => row.categoryId === categoryId)}
          placeholder="새 소분류 이름"
          emptyText="소분류가 없어요"
          onAdd={(name) =>
            run(path, "POST", { categoryId, name }, "소분류를 추가했어요.")
          }
          onRename={(id, name) =>
            run(path, "PATCH", { id, name }, "소분류 이름을 바꿨어요.")
          }
          onDelete={(id) => run(path, "DELETE", { id }, "소분류를 삭제했어요.")}
        />
      )}
    </div>
  );
};

export const AssetsTab = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const run = useLedgerAction();
  const path = "/api/ledger/assets";
  return (
    <NamedListEditor
      items={ledger.assets}
      placeholder="새 결제수단 이름"
      emptyText="결제수단이 없어요"
      onAdd={(name) => run(path, "POST", { name }, "결제수단을 추가했어요.")}
      onRename={(id, name) =>
        run(path, "PATCH", { id, name }, "결제수단 이름을 바꿨어요.")
      }
      onDelete={(id) => run(path, "DELETE", { id }, "결제수단을 삭제했어요.")}
    />
  );
};

const OptionSelect = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number | null;
  options: { id: number; name: string }[];
  onChange: (value: number | null) => void;
}) => {
  const items = [
    { value: "none", label: `${label} 없음` },
    ...options.map((option) => ({ value: String(option.id), label: option.name })),
  ];
  return (
    <Select
      items={items}
      value={value == null ? "none" : String(value)}
      onValueChange={(next) =>
        onChange(next == null || next === "none" ? null : Number(next))
      }
    >
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const KIND_OPTIONS: { id: LedgerEntryKind; label: string }[] = [
  { id: "expense", label: "지출" },
  { id: "income", label: "입금" },
  { id: "transfer", label: "이체" },
];

const RecurringForm = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const run = useLedgerAction();
  const [kind, setKind] = useState<LedgerEntryKind>("expense");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");
  const [startDate, setStartDate] = useState(todayKst());
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [assetId, setAssetId] = useState<number | null>(null);
  const [savingsId, setSavingsId] = useState<number | null>(null);

  const categories = ledger.categories.filter((category) => category.kind === kind);
  const subcategories = ledger.subcategories.filter(
    (row) => row.categoryId === categoryId
  );
  const ready =
    memo.trim() &&
    Number(amount) > 0 &&
    Number(day) >= 1 &&
    Number(day) <= 31 &&
    startDate &&
    (kind !== "transfer" || savingsId != null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const saved = await run(
      "/api/ledger/recurring",
      "POST",
      {
        kind,
        memo: memo.trim(),
        amount: Number(amount),
        dayOfMonth: Number(day),
        startDate,
        categoryId,
        subcategoryId,
        assetId,
        savingsId,
      },
      "반복 거래를 추가했어요."
    );
    if (saved) {
      setMemo("");
      setAmount("");
      setDay("");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-3 rounded-lg bg-muted p-[3px]">
        {KIND_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={kind === option.id}
            onClick={() => {
              setKind(option.id);
              setCategoryId(null);
              setSubcategoryId(null);
              setSavingsId(null);
            }}
            className={cn(
              "rounded-md py-1 text-[12px] font-medium transition-colors",
              kind === option.id && "bg-background text-foreground shadow-sm",
              kind !== option.id && "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <Input
        aria-label="반복 내용"
        value={memo}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="내용 (예: 넷플릭스)"
        maxLength={200}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          aria-label="반복 금액"
          value={amount ? Number(amount).toLocaleString("ko-KR") : ""}
          onChange={(event) => setAmount(cleanDigits(event.target.value).slice(0, 10))}
          inputMode="numeric"
          placeholder="금액"
          className="text-right tabular-nums"
        />
        <Input
          aria-label="매월 반복일"
          value={day}
          onChange={(event) => setDay(cleanDigits(event.target.value).slice(0, 2))}
          inputMode="numeric"
          placeholder="매월 며칠 (1~31)"
          className="text-right tabular-nums"
        />
      </div>
      <DatePicker
        aria-label="반복 시작일"
        value={startDate}
        onChange={setStartDate}
        placeholder="시작일"
      />
      {kind === "transfer" && (
        <OptionSelect
          label="저축 상품"
          value={savingsId}
          options={ledger.savings}
          onChange={setSavingsId}
        />
      )}
      {kind !== "transfer" && (
        <OptionSelect
          label="분류"
          value={categoryId}
          options={categories}
          onChange={(value) => {
            setCategoryId(value);
            setSubcategoryId(null);
          }}
        />
      )}
      {subcategories.length > 0 && (
        <OptionSelect
          label="소분류"
          value={subcategoryId}
          options={subcategories}
          onChange={setSubcategoryId}
        />
      )}
      <OptionSelect
        label="결제수단"
        value={assetId}
        options={ledger.assets}
        onChange={setAssetId}
      />
      <Button type="submit" className="w-full" disabled={!ready}>
        <Plus /> 반복 거래 추가
      </Button>
    </form>
  );
};

const ruleDetail = (rule: LedgerRecurringView, ledger: LedgerMonthPayload) => {
  const nameOf = (rows: { id: number; name: string }[], id: number | null) =>
    id == null ? null : rows.find((row) => row.id === id)?.name;
  return [
    `매월 ${rule.dayOfMonth}일`,
    rule.kind === "transfer"
      ? `이체 → ${nameOf(ledger.savings, rule.savingsId) ?? "저축"}`
      : nameOf(ledger.categories, rule.categoryId),
    nameOf(ledger.assets, rule.assetId),
    rule.lastDate && `최근 ${rule.lastDate.replaceAll("-", ".")}`,
  ]
    .filter(Boolean)
    .join(" · ");
};

/** 반복 탭: 등록된 반복·추천 카드와 직접 추가 카드. */
export const RecurringTab = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const token = useAuthStore((s) => s.token);
  const run = useLedgerAction();
  const path = "/api/ledger/recurring";

  const { data: candidates = [] } = useQuery({
    queryKey: ledgerKeys.recurringCandidates,
    queryFn: async () => {
      const data = await ledgerRequest<{ candidates: LedgerRecurringCandidate[] }>(
        token,
        "/api/ledger/recurring/candidates"
      );
      return data.candidates;
    },
    enabled: Boolean(token),
  });

  const addCandidate = (candidate: LedgerRecurringCandidate) =>
    run(
      path,
      "POST",
      {
        kind: candidate.kind,
        memo: candidate.memo,
        amount: candidate.amount,
        dayOfMonth: candidate.dayOfMonth,
        // 이미 기록한 달을 다시 만들지 않도록 마지막 내역 다음 날부터 시작한다.
        startDate: kst(candidate.lastDate).add(1, "day").format("YYYY-MM-DD"),
        categoryId: candidate.categoryId,
        subcategoryId: candidate.subcategoryId,
        assetId: candidate.assetId,
        savingsId: candidate.savingsId,
      },
      "반복 거래를 추가했어요."
    );

  const listSections = (
    <>
      <section>
        <h3 className="text-[12px] font-medium text-muted-foreground">
          등록된 반복 거래
        </h3>
        {ledger.recurring.length ? (
          <ul className="mt-1 divide-y divide-border">
            {ledger.recurring.map((rule) => (
              <li key={rule.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-[13px] text-foreground",
                      !rule.active && "text-muted-foreground line-through"
                    )}
                  >
                    {rule.memo || "반복 거래"}{" "}
                    <span className="tabular-nums">{formatWon(rule.amount)}</span>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {ruleDetail(rule, ledger)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    run(
                      path,
                      "PATCH",
                      { id: rule.id, active: !rule.active },
                      rule.active ? "반복을 껐어요." : "반복을 켰어요."
                    )
                  }
                >
                  {rule.active ? "끄기" : "켜기"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${rule.memo} 반복 삭제`}
                  onClick={() =>
                    run(path, "DELETE", { id: rule.id }, "반복 거래를 삭제했어요.")
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[12px] text-muted-foreground">
            아직 없어요. 등록하면 매달 그날 내역이 자동으로 생겨요.
          </p>
        )}
      </section>

      {candidates.length > 0 && (
        <section>
          <h3 className="text-[12px] font-medium text-muted-foreground">
            내역에서 찾은 추천
          </h3>
          <ul className="mt-1 divide-y divide-border">
            {candidates.map((candidate) => (
              <li
                key={`${candidate.memo}-${candidate.amount}`}
                className="flex items-center gap-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-foreground">
                    {candidate.memo}{" "}
                    <span className="tabular-nums">{formatWon(candidate.amount)}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    매월 {candidate.dayOfMonth}일 · 최근{" "}
                    {candidate.lastDate.replaceAll("-", ".")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${candidate.memo} 반복 등록`}
                  onClick={() => addCandidate(candidate)}
                >
                  <Plus /> 등록
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  const formSection = (
    <section>
      <h3 className="mb-1 text-[12px] font-medium text-muted-foreground">직접 추가</h3>
      <RecurringForm ledger={ledger} />
    </section>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 [&>*]:min-w-0">
      <div className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        {listSections}
      </div>
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        {formSection}
      </div>
    </div>
  );
};
