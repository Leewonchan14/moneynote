"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CategoryIcon } from "@/components/ledger/category-icon";
import type { LedgerEntryView } from "@/components/ledger/entry-list";
import { MapPlaceCard } from "@/components/ledger/place-photos";
import { Button, buttonVariants } from "@/components/ui/button";
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
import type { LedgerEntryKind, LedgerMonthPayload } from "@/lib/db/ledger";
import type { LedgerSuggestion, LedgerSuggestions } from "@/lib/db/ledger-extras";
import { ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatWon, nowTimeKst, todayKst } from "@/lib/ledger/format";
import {
  extractMapUrl,
  isHttpUrl,
  isNaverMapUrl,
  MAX_MAP_URL_LENGTH,
} from "@/lib/ledger/map-url";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: LedgerMonthPayload;
  defaultDate: string;
  entry: LedgerEntryView | null;
}

const numberDisplay = (digits: string) =>
  digits ? Number(digits).toLocaleString("ko-KR") : "";

const cleanDigits = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

const MAX_SUGGESTION_CHIPS = 8;

/** 입력이 잠깐 멈춘 뒤의 값. 링크를 치는 동안 매번 장소를 읽지 않게 한다. */
const useSettledValue = <T,>(value: T, delayMs = 400) => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
};

interface MapPlacePreview {
  placeName: string;
  imageUrls: string[];
}

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[12px] font-medium text-muted-foreground">{children}</p>
);

const Chip = ({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={cn(
      "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] text-foreground transition-colors",
      selected && "border-primary bg-muted ring-1 ring-primary",
      !selected && "border-border bg-card hover:bg-muted"
    )}
  >
    {children}
  </button>
);

export const EntryDialog = ({
  open,
  onOpenChange,
  ledger,
  defaultDate,
  entry,
}: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{entry ? "내역 수정" : "내역 추가"}</DialogTitle>
        <DialogDescription>
          가계부에 {entry ? "기록을 고쳐요" : "새 기록을 남겨요"}.
        </DialogDescription>
      </DialogHeader>
      <EntryForm
        ledger={ledger}
        defaultDate={defaultDate}
        entry={entry}
        onOpenChange={onOpenChange}
      />
    </DialogContent>
  </Dialog>
);

const EntryForm = ({ ledger, defaultDate, entry, onOpenChange }: Omit<Props, "open">) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<LedgerEntryKind>(entry?.kind ?? "expense");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [entryDate, setEntryDate] = useState(entry?.entryDate ?? defaultDate);
  const [entryTime, setEntryTime] = useState(
    entry ? (entry.entryTime ?? "") : defaultDate === todayKst() ? nowTimeKst() : ""
  );
  const [categoryId, setCategoryId] = useState<number | null>(entry?.categoryId ?? null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(
    entry?.subcategoryId ?? null
  );
  const [savingsId, setSavingsId] = useState<number | null>(entry?.savingsId ?? null);
  // undefined면 아직 고르지 않은 상태라 최근 많이 쓴 결제수단을 추천한다.
  const [assetChoice, setAssetChoice] = useState<number | null | undefined>(
    entry ? entry.assetId : undefined
  );
  const [memo, setMemo] = useState(entry?.memo ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [mapUrl, setMapUrl] = useState(entry?.mapUrl ?? "");
  // 저장된 링크 그대로일 때만 저장해 둔 장소 사진을 보여 준다.
  const savedPlace =
    entry != null &&
    entry.mapUrl !== "" &&
    extractMapUrl(mapUrl) === entry.mapUrl &&
    Boolean(entry.mapImageUrls.length || entry.mapPlaceName);
  // 저장하기 전에도 네이버 지도 링크의 장소 사진을 미리 읽어 보여 준다.
  const typedMapUrl = extractMapUrl(mapUrl);
  const settledMapUrl = useSettledValue(typedMapUrl);
  const wantsPreview = !savedPlace && isNaverMapUrl(typedMapUrl);
  const previewUrl = wantsPreview && settledMapUrl === typedMapUrl ? typedMapUrl : null;
  const placePreview = useQuery({
    queryKey: ledgerKeys.mapPlace(previewUrl ?? ""),
    queryFn: async () => {
      const data = await ledgerRequest<{ place: MapPlacePreview | null }>(
        token,
        `/api/ledger/map-place?url=${encodeURIComponent(previewUrl ?? "")}`
      );
      return data.place;
    },
    enabled: Boolean(token && previewUrl),
    staleTime: Infinity,
    retry: false,
  });
  const previewPlace = previewUrl ? placePreview.data : undefined;
  const previewLoading = wantsPreview && (previewUrl === null || placePreview.isPending);
  const [tags, setTags] = useState(entry?.tags ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // undefined면 아직 고르지 않은 상태라 날짜로 여행을 추천한다.
  const [tripChoice, setTripChoice] = useState<number | null | undefined>(
    entry ? entry.tripId : undefined
  );

  const tripsOnDate = ledger.trips.filter(
    (trip) => trip.startDate <= entryDate && entryDate <= trip.endDate
  );
  const selectedTripId =
    tripChoice !== undefined
      ? tripChoice
      : tripsOnDate.length === 1
        ? tripsOnDate[0].id
        : null;

  const categories = ledger.categories.filter((category) => category.kind === kind);
  const subcategories = ledger.subcategories.filter(
    (subcategory) => subcategory.categoryId === categoryId
  );

  const { data: suggestions } = useQuery({
    queryKey: ledgerKeys.suggestions,
    queryFn: async () => {
      const data = await ledgerRequest<{ suggestions: LedgerSuggestions }>(
        token,
        "/api/ledger/suggestions"
      );
      return data.suggestions;
    },
    enabled: Boolean(token),
  });
  const suggestionItems = suggestions?.items ?? [];
  const assetId =
    assetChoice !== undefined ? assetChoice : (suggestions?.defaultAssetId ?? null);

  const query = memo.trim().toLowerCase();
  const suggestionChips = entry
    ? []
    : suggestionItems
        .filter(
          (item) =>
            item.memo !== memo.trim() &&
            (!query || item.memo.toLowerCase().includes(query))
        )
        .slice(0, MAX_SUGGESTION_CHIPS);

  const applyLinks = (item: LedgerSuggestion) => {
    setCategoryId(item.categoryId);
    setSubcategoryId(item.subcategoryId);
    setSavingsId(item.savingsId);
    if (item.assetId != null) setAssetChoice(item.assetId);
  };

  const applySuggestion = (item: LedgerSuggestion) => {
    setKind(item.kind);
    setMemo(item.memo);
    setAmount(String(item.amount));
    applyLinks(item);
  };

  const changeMemo = (value: string) => {
    setMemo(value);
    if (entry || categoryId != null || savingsId != null) return;
    const match = suggestionItems.find(
      (item) => item.memo === value.trim() && item.kind === kind
    );
    if (match) applyLinks(match);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ledgerKeys.all });

  const saveEntry = useMutation({
    mutationFn: () => {
      const payload = {
        entryDate,
        entryTime: entryTime || null,
        kind,
        amount: Number(amount),
        categoryId,
        subcategoryId,
        assetId,
        savingsId,
        memo: memo.trim(),
        note: note.trim(),
        // 지도 링크는 지출에만 둔다.
        mapUrl: kind === "expense" ? extractMapUrl(mapUrl) : "",
        tags: tags.trim(),
        tripId: kind === "expense" ? selectedTripId : (entry?.tripId ?? null),
      };
      return ledgerRequest(token, "/api/ledger/entries", {
        method: entry ? "PATCH" : "POST",
        body: entry ? { id: entry.id, ...payload } : payload,
      });
    },
    onSuccess: () => {
      toast.success(entry ? "기록을 수정했어요." : "기록을 저장했어요.");
      invalidate();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restoreEntry = async (id: number) => {
    try {
      await ledgerRequest(token, "/api/ledger/entries/restore", {
        method: "POST",
        body: { id },
      });
      toast.success("기록을 되돌렸어요.");
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "되돌리지 못했어요.");
    }
  };

  const removeEntry = useMutation({
    mutationFn: async () => {
      if (!entry) return null;
      await ledgerRequest(token, "/api/ledger/entries", {
        method: "DELETE",
        body: { id: entry.id },
      });
      return entry.id;
    },
    onSuccess: (id) => {
      toast.success("기록을 지웠어요.", {
        duration: 8000,
        ...(id == null
          ? {}
          : { action: { label: "되돌리기", onClick: () => void restoreEntry(id) } }),
      });
      invalidate();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 1 || value > 1_000_000_000) {
      toast.error("금액을 1원 이상 10억 원 이하로 입력해 주세요.");
      return;
    }
    if (!entryDate) {
      toast.error("날짜를 선택해 주세요.");
      return;
    }
    if (kind === "transfer" && savingsId == null) {
      toast.error("이체할 저축 상품을 선택해 주세요.");
      return;
    }
    saveEntry.mutate();
  };

  const changeKind = (next: LedgerEntryKind) => {
    if (next === kind) return;
    setKind(next);
    setCategoryId(null);
    setSubcategoryId(null);
    setSavingsId(null);
  };

  const selectCategory = (id: number) => {
    setCategoryId(id === categoryId ? null : id);
    setSubcategoryId(null);
  };

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-3 rounded-lg bg-muted p-[3px]">
          {(
            [
              { id: "expense", label: "지출" },
              { id: "income", label: "입금" },
              { id: "transfer", label: "이체" },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={kind === option.id}
              onClick={() => changeKind(option.id)}
              className={`rounded-md py-1.5 text-[13px] font-medium transition-colors ${
                kind === option.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div>
          <label
            className="text-[12px] font-medium text-muted-foreground"
            htmlFor="ledger-memo"
          >
            내용
          </label>
          <Input
            id="ledger-memo"
            value={memo}
            onChange={(event) => changeMemo(event.target.value)}
            placeholder="예: 성수동 카페"
            maxLength={200}
            autoComplete="off"
            className="mt-1"
          />
          {suggestionChips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1" aria-label="자주 쓰는 내역">
              {suggestionChips.map((item) => (
                <button
                  key={item.memo}
                  type="button"
                  onClick={() => applySuggestion(item)}
                  className="rounded-md bg-muted px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-accent"
                >
                  {item.memo}{" "}
                  <span className="text-muted-foreground tabular-nums">
                    {formatWon(item.amount)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label
            className="text-[12px] font-medium text-muted-foreground"
            htmlFor="ledger-amount"
          >
            금액
          </label>
          <div className="relative mt-1">
            <Input
              id="ledger-amount"
              value={numberDisplay(amount)}
              onChange={(event) =>
                setAmount(cleanDigits(event.target.value).slice(0, 10))
              }
              inputMode="numeric"
              placeholder="0"
              autoComplete="off"
              className="h-14 pr-8 text-right text-2xl font-semibold tabular-nums"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
              원
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="min-w-0">
            <label
              className="block text-[12px] font-medium text-muted-foreground"
              htmlFor="ledger-date"
            >
              날짜
            </label>
            <DatePicker
              id="ledger-date"
              value={entryDate}
              onChange={setEntryDate}
              className="mt-1"
            />
          </div>
          <div>
            <label
              className="block text-[12px] font-medium text-muted-foreground"
              htmlFor="ledger-time"
            >
              시각
            </label>
            <Input
              id="ledger-time"
              type="time"
              value={entryTime}
              onChange={(event) => setEntryTime(event.target.value)}
              className="mt-1 w-36"
            />
          </div>
        </div>

        {kind === "transfer" && (
          <div>
            <FieldLabel>저축 상품</FieldLabel>
            {ledger.savings.length ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {ledger.savings.map((product) => (
                  <Chip
                    key={product.id}
                    selected={product.id === savingsId}
                    onClick={() => setSavingsId(product.id)}
                  >
                    {product.name}
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[12px] text-muted-foreground">
                저축 탭에서 상품을 먼저 추가해 주세요.
              </p>
            )}
          </div>
        )}

        {kind === "expense" && (
          <div>
            <FieldLabel>분류</FieldLabel>
            {categories.length ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {categories.map((category) => (
                  <Chip
                    key={category.id}
                    selected={category.id === categoryId}
                    onClick={() => selectCategory(category.id)}
                  >
                    <CategoryIcon icon={category.icon} color={category.color} size={20} />
                    {category.name}
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[12px] text-muted-foreground">
                분류가 없어요. 예산·설정에서 추가해 주세요.
              </p>
            )}
          </div>
        )}

        {kind === "expense" && subcategories.length > 0 && (
          <div>
            <FieldLabel>소분류</FieldLabel>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {subcategories.map((subcategory) => (
                <Chip
                  key={subcategory.id}
                  selected={subcategory.id === subcategoryId}
                  onClick={() =>
                    setSubcategoryId(
                      subcategory.id === subcategoryId ? null : subcategory.id
                    )
                  }
                >
                  {subcategory.name}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {ledger.assets.length > 0 && (
          <div>
            <FieldLabel>결제수단</FieldLabel>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ledger.assets.map((asset) => (
                <Chip
                  key={asset.id}
                  selected={asset.id === assetId}
                  onClick={() => setAssetChoice(asset.id === assetId ? null : asset.id)}
                >
                  {asset.name}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {kind === "expense" && ledger.trips.length > 0 && (
          <div>
            <p className="text-[12px] font-medium text-muted-foreground">여행</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ledger.trips.map((trip) => {
                const selected = trip.id === selectedTripId;
                return (
                  <button
                    key={trip.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTripChoice(selected ? null : trip.id)}
                    className={`rounded-md border px-3 py-1.5 text-[12px] transition-colors ${
                      selected
                        ? "border-primary bg-muted text-foreground ring-1 ring-primary"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    {trip.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {kind === "expense" && (
          <div>
            <label
              className="text-[12px] font-medium text-muted-foreground"
              htmlFor="ledger-map-url"
            >
              지도 링크
            </label>
            <div className="mt-1 flex gap-2">
              <Input
                id="ledger-map-url"
                inputMode="url"
                value={mapUrl}
                onChange={(event) => setMapUrl(event.target.value)}
                // 지도 앱의 공유 문구를 통째로 붙여도 링크만 남긴다.
                onBlur={() => setMapUrl(extractMapUrl(mapUrl))}
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData("text");
                  const url = extractMapUrl(pasted);
                  if (url === pasted.trim()) return;
                  event.preventDefault();
                  setMapUrl(url);
                }}
                placeholder="네이버·카카오·구글 지도 공유 링크"
                maxLength={MAX_MAP_URL_LENGTH}
                autoComplete="off"
                className="min-w-0 flex-1"
              />
              {isHttpUrl(mapUrl) && (
                <a
                  href={extractMapUrl(mapUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="지도 열기"
                  className={buttonVariants({ variant: "outline", size: "icon" })}
                >
                  <ExternalLink />
                </a>
              )}
            </div>
            {entry && savedPlace ? (
              <MapPlaceCard
                url={entry.mapUrl}
                placeName={entry.mapPlaceName}
                imageUrls={entry.mapImageUrls}
              />
            ) : previewUrl && previewPlace ? (
              <MapPlaceCard
                url={previewUrl}
                placeName={previewPlace.placeName}
                imageUrls={previewPlace.imageUrls}
              />
            ) : previewLoading ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                네이버 지도에서 장소 사진을 불러오는 중이에요…
              </p>
            ) : (
              wantsPreview && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  네이버 지도에서 장소 사진을 찾지 못했어요. 저장하면 한 번 더 불러와요.
                </p>
              )
            )}
          </div>
        )}

        <div>
          <label
            className="text-[12px] font-medium text-muted-foreground"
            htmlFor="ledger-note"
          >
            메모
          </label>
          <Textarea
            id="ledger-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="자세히 남기고 싶은 내용"
            maxLength={2000}
            rows={2}
            className="mt-1"
          />
        </div>

        <div>
          <label
            className="text-[12px] font-medium text-muted-foreground"
            htmlFor="ledger-tags"
          >
            태그
          </label>
          <Input
            id="ledger-tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="쉼표로 구분 (예: 여행, 생일)"
            maxLength={100}
            className="mt-1"
          />
        </div>
      </div>

      <div className="-mx-4 -mb-4 flex shrink-0 items-center justify-between gap-2 border-t border-border bg-popover px-4 py-3">
        {entry && confirmDelete ? (
          <div className="flex w-full items-center gap-2 text-[12px] text-destructive">
            <span className="flex-1">정말 지울까요?</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => removeEntry.mutate()}
              disabled={removeEntry.isPending}
            >
              지우기
            </Button>
          </div>
        ) : (
          <>
            <div>
              {entry && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  삭제
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button type="submit" disabled={saveEntry.isPending}>
                저장
              </Button>
            </div>
          </>
        )}
      </div>
    </form>
  );
};
