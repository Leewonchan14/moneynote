"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ExternalLink, Loader2, MapPin, MapPinned, RefreshCw, X } from "lucide-react";
import dynamic from "next/dynamic";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { formatPeriod, MapPeriodFilter } from "@/components/ledger/map/map-period-filter";
import { PlacePhotoCarousel } from "@/components/ledger/place-photos";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { kst } from "@/lib/kst";
import { LEDGER_LIVE_QUERY, ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatWon } from "@/lib/ledger/format";
import {
  toMapSearchParams,
  type LedgerMapPayload,
  type LedgerMapPayment,
  type LedgerMapPlace,
  type LedgerMapQuery,
  type LedgerMapSubcategory,
} from "@/lib/ledger/map-types";
import { cn } from "@/lib/utils";

/** 지도에서 고른 장소(LedgerMapPlace.key)를 남기는 주소 쿼리 이름 */
export const MAP_PLACE_PARAM = "place";
/** 장소를 고를 때마다 히스토리를 쌓지 않고 주소만 바꾼다. */
export const mapPlaceParser = parseAsString.withOptions({ history: "replace" });

const Spinner = () => <Loader2 className="size-5 animate-spin text-muted-foreground" />;

/** 지도(maplibre)는 브라우저에서만 그린다. 서버 렌더링과 첫 번들에서 뺀다. */
const PlaceMap = dynamic(
  () => import("@/components/ledger/map/place-map").then((mod) => mod.PlaceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center">
        <Spinner />
      </div>
    ),
  }
);

type MapPeriod = Pick<LedgerMapQuery, "range" | "from" | "to" | "trip">;

/** 요약 앞에 붙이는 기간 이름. 전체·올해·이번 달은 칩으로 충분하다. */
const periodTitle = (data: LedgerMapPayload) => {
  if (data.trip) return `${data.trip.name} · ${formatPeriod(data.from ?? "", data.to)}`;
  if (data.range === "custom" && data.from) return formatPeriod(data.from, data.to);
  return null;
};

const visitDate = (date: string) => {
  const day = kst(date);
  return day.format(day.isSame(kst(), "year") ? "M.D (dd)" : "YY.M.D (dd)");
};

const paymentLabel = (payment: LedgerMapPayment) =>
  payment.memo || payment.categoryName || "지출";

const PlacePhoto = ({ src, className }: { src: string | null; className?: string }) => (
  <div
    className={cn(
      // 흰 바탕 사진도 테두리가 보이게 한다.
      "flex shrink-0 items-center justify-center overflow-hidden border border-border bg-muted",
      className
    )}
  >
    {src ? (
      // 네이버 이미지 서버에서 바로 받는다. next/image 최적화를 거치지 않는다.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="size-full object-cover"
      />
    ) : (
      <MapPin className="size-5 text-muted-foreground/60" />
    )}
  </div>
);

const PlaceDetail = ({
  place,
  onClose,
}: {
  place: LedgerMapPlace;
  onClose: () => void;
}) => (
  <section
    aria-label={`${place.name} 방문 기록`}
    className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
  >
    {/*
      고른 장소가 바뀌면 사진 위치(몇 번째 사진)를 처음으로 돌린다.
      흰 바탕 사진(로고 등)도 카드 본문과 구분되게 아래에 경계선을 둔다. 사진이 없으면 숨긴다.
    */}
    <div className="border-b border-border empty:hidden">
      <PlacePhotoCarousel
        key={place.key}
        name={place.name}
        mapUrl={place.mapUrl}
        imageUrls={place.imageUrls}
      />
    </div>
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-semibold text-foreground">
            {place.name}
          </h3>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="선택 해제"
            title="선택 해제 (Esc)"
            className="-mt-1 -mr-1.5 shrink-0 text-muted-foreground"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        {(place.category || place.address) && (
          <p className="text-[12px] text-muted-foreground">
            {[place.category, place.address].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="mt-1 text-[13px] text-foreground tabular-nums">
          {place.visits}번 방문 · {formatWon(place.total)}
        </p>
      </div>
      {/* 간 날이 많으면 이 목록만 스크롤한다. 장소 이름과 지도 링크는 늘 보인다. */}
      <ul
        aria-label="간 날"
        className="-mr-2 flex max-h-72 flex-col divide-y divide-border overflow-y-auto overscroll-contain pr-2"
      >
        {place.entries.map((visit) => {
          const several = visit.payments.length > 1;
          return (
            <li key={visit.date} className="flex flex-col gap-1 py-1.5 text-[13px]">
              <div className="flex items-baseline gap-3">
                <span className="w-20 shrink-0 text-muted-foreground tabular-nums">
                  {visitDate(visit.date)}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-foreground",
                    several && "text-muted-foreground tabular-nums"
                  )}
                >
                  {several
                    ? `결제 ${visit.payments.length}건`
                    : paymentLabel(visit.payments[0])}
                </span>
                <span className="shrink-0 font-medium text-foreground tabular-nums">
                  {formatWon(visit.amount)}
                </span>
              </div>
              {/* 같은 날 여러 번 결제했으면 날짜 아래에 결제를 하나씩 먼저 한 것부터 보여 준다. */}
              {several && (
                <ul
                  aria-label={`${visitDate(visit.date)} 결제`}
                  className="flex flex-col gap-0.5 pl-23 text-[12px]"
                >
                  {visit.payments.map((payment) => (
                    <li key={payment.id} className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {paymentLabel(payment)}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {formatWon(payment.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <a
        href={place.mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <ExternalLink />
        네이버 지도에서 열기
      </a>
    </div>
  </section>
);

const PlaceList = ({
  places,
  selectedKey,
  onSelect,
}: {
  places: LedgerMapPlace[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) => (
  <ol
    aria-label="다녀온 곳"
    className="flex flex-col gap-0.5 rounded-xl bg-card p-1.5 ring-1 ring-foreground/10"
  >
    {places.map((place, index) => (
      <li key={place.key}>
        <button
          type="button"
          aria-current={place.key === selectedKey || undefined}
          onClick={() => onSelect(place.key)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            place.key === selectedKey && "bg-muted"
          )}
        >
          <span className="w-4 shrink-0 text-center text-[12px] text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <PlacePhoto src={place.imageUrl} className="size-11 rounded-lg" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-medium text-foreground">
              {place.name}
            </span>
            <span className="truncate text-[12px] text-muted-foreground">
              {place.category || place.address || "장소"}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className="text-[13px] font-medium text-foreground tabular-nums">
              {place.visits}번
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {formatWon(place.total)}
            </span>
          </span>
        </button>
      </li>
    ))}
  </ol>
);

const EmptyState = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-xl bg-card px-6 py-12 text-center ring-1 ring-foreground/10">
    <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-primary">
      <MapPinned className="size-5" />
    </div>
    <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
    <p className="mt-1 text-[13px] text-muted-foreground">{body}</p>
  </div>
);

export interface LedgerMapViewProps {
  /** 탭 위 분류 필터에서 고른 분류. 없으면 null */
  categoryId: number | null;
  /** 고른 소분류. 분류를 골랐을 때만 쓴다 */
  subcategory: LedgerMapSubcategory | null;
  /** 요약에 붙이는 분류(소분류) 이름 */
  categoryLabel: string | null;
}

/**
 * 지도 탭: 지출에 붙인 네이버 지도 링크로 다녀온 곳을 지도에 핀으로 모아 본다.
 * 기간은 지도 탭에서 따로 고르고(전체·올해·이번 달·날짜·여행), 분류는 탭 위 분류 필터를 따른다.
 */
export const LedgerMapView = ({
  categoryId,
  subcategory,
  categoryLabel,
}: LedgerMapViewProps) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<MapPeriod>({ range: "all" });
  // 고른 장소는 주소(?place=)에 남긴다. 새로고침·공유해도 같은 장소가 열린다.
  const [selectedKey, setSelectedKey] = useQueryState(MAP_PLACE_PARAM, mapPlaceParser);
  const search = toMapSearchParams({ ...period, category: categoryId, sub: subcategory });

  const { data, isLoading, error } = useQuery({
    queryKey: ledgerKeys.map(search),
    queryFn: () => ledgerRequest<LedgerMapPayload>(token, `/api/ledger/map?${search}`),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
    ...LEDGER_LIVE_QUERY,
  });

  // 기간·분류가 바뀌면 고른 장소를 닫는다. 처음 열 때는 주소의 장소를 그대로 둔다.
  const lastSearch = useRef(search);
  useEffect(() => {
    if (lastSearch.current === search) return;
    lastSearch.current = search;
    void setSelectedKey(null);
  }, [search, setSelectedKey]);

  const refresh = useMutation({
    mutationFn: () =>
      ledgerRequest<{ resolved: number; remaining: number }>(token, "/api/ledger/map", {
        method: "POST",
      }),
    onSuccess: ({ resolved, remaining }) => {
      if (resolved) toast.success(`${resolved}곳을 지도에 찍었어요.`);
      else toast.error("이번에도 장소를 못 찾았어요. 잠시 뒤 다시 해 주세요.");
      if (remaining && resolved) toast(`아직 ${remaining}건이 남았어요.`);
      void queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
    },
    onError: (err) => toast.error(err.message),
  });

  // Esc로 고른 장소를 닫는다. 사진 확대 창 같은 대화상자가 열려 있으면 그쪽이 먼저 닫힌다.
  const hasSelection = Boolean(selectedKey);
  useEffect(() => {
    if (!hasSelection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("[role=dialog]")) return;
      void setSelectedKey(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasSelection, setSelectedKey]);

  const places = data?.places ?? [];
  const selected = places.find((place) => place.key === selectedKey) ?? null;
  const totalVisits = places.reduce((sum, place) => sum + place.visits, 0);
  const totalSpent = places.reduce((sum, place) => sum + place.total, 0);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  // 이미 고른 장소를 다시 누르면 선택을 푼다.
  const selectPlace = (key: string) =>
    void setSelectedKey((current) => (current === key ? null : key));
  // 좁은 화면에서는 목록이 지도 아래에 있으므로, 목록에서 고르면 지도가 보이게 올린다.
  const selectFromList = (key: string) => {
    selectPlace(key);
    if (key === selectedKey) return;
    const box = mapBoxRef.current;
    if (box && box.getBoundingClientRect().top < 0) {
      box.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const changePeriod = (next: MapPeriod) => setPeriod(next);
  const filtered = period.range !== "all" || categoryId !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <MapPeriodFilter
          range={period.range}
          from={data?.range === "custom" ? data.from : (period.from ?? null)}
          to={data?.range === "custom" ? data.to : (period.to ?? null)}
          trips={data?.trips ?? []}
          selectedTrip={data?.trip ?? null}
          onPreset={(range) => changePeriod({ range })}
          onCustom={(from, to) => changePeriod({ range: "custom", from, to })}
          onTrip={(trip) => changePeriod({ range: "trip", trip })}
        />
        <p
          className="px-1 text-[12px] text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {data
            ? [
                periodTitle(data),
                categoryLabel,
                `다녀온 곳 ${places.length}곳 · ${totalVisits}번 · ${formatWon(totalSpent)}`,
              ]
                .filter(Boolean)
                .join(" · ")
            : "내역에 남긴 네이버 지도 링크로 다녀온 곳을 모아 봐요."}
        </p>
      </div>

      {data && data.unresolved > 0 && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2 text-[13px] text-foreground"
        >
          <span>지도에 못 찍은 곳 {data.unresolved}건</span>
          <Button
            size="sm"
            variant="outline"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            다시 찾기
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {error && !data && (
        <p className="py-10 text-center text-sm text-muted-foreground">{error.message}</p>
      )}

      {data &&
        !places.length &&
        (filtered ? (
          <EmptyState
            title="이 조건에는 지도에 찍힌 곳이 없어요"
            body="다른 기간·여행·분류를 골라 보세요."
          />
        ) : (
          <EmptyState
            title="아직 지도에 찍힌 곳이 없어요"
            body="지출 내역에 네이버 지도 링크를 붙이면 여기에 핀으로 모여요."
          />
        ))}

      {places.length > 0 && (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
          <div
            ref={mapBoxRef}
            className="h-[52vh] min-h-[300px] scroll-mt-4 overflow-hidden rounded-xl ring-1 ring-foreground/10 md:sticky md:top-4 md:h-[calc(100dvh-140px)]"
          >
            <PlaceMap places={places} selectedKey={selectedKey} onSelect={selectPlace} />
          </div>
          <div className="flex flex-col gap-3">
            {/*
              넓은 화면에서는 목록을 내려도 고른 장소가 위에 붙어 있다. 위쪽 여백만큼 배경을 깔아,
              붙어 있을 때 그 틈으로 목록이 비치지 않게 한다. 카드가 화면을 다 덮으면 목록 끝을
              못 고르므로, 높이를 줄이고 카드 안에서 스크롤한다.
            */}
            {selected && (
              <div className="md:sticky md:top-0 md:z-10 md:-mt-3 md:max-h-[calc(100dvh-6rem)] md:overflow-y-auto md:overscroll-contain md:bg-background md:pt-3">
                <PlaceDetail place={selected} onClose={() => void setSelectedKey(null)} />
              </div>
            )}
            <PlaceList
              places={places}
              selectedKey={selectedKey}
              onSelect={selectFromList}
            />
          </div>
        </div>
      )}
    </div>
  );
};
