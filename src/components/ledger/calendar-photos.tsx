"use client";

import { MapPin } from "lucide-react";
import { type ReactElement, useState } from "react";

import type { LedgerEntryView } from "@/components/ledger/entry-list";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { formatDayKo } from "@/lib/ledger/format";
import { cn } from "@/lib/utils";

/*
 * 달력 칸의 장소 사진: 칸 구석의 폴라로이드 스티커와, 마우스를 올리면 뜨는 미리보기.
 * 사진은 네이버 이미지 서버에서 바로 받으므로 <img>를 쓴다(place-photos.tsx와 같다).
 */

export interface DayPlace {
  name: string;
  mapUrl: string;
  photos: string[];
}

/** 미리보기에 보여 주는 장소 수와 장소마다 사진 수 */
const PREVIEW_PLACES = 3;
const PREVIEW_PHOTOS = 3;

/**
 * 날짜별로 사진이 있는 장소. 금액이 큰 내역의 장소가 앞에 오고, 같은 장소는 한 번만 센다.
 * 맨 앞 장소의 첫 사진이 그날 대표 사진이다.
 */
export const placesByDate = (entries: LedgerEntryView[]) => {
  const byDate = new Map<string, DayPlace[]>();
  const withPhotos = entries
    .filter((entry) => entry.mapUrl && entry.mapImageUrls.length > 0)
    .sort((a, b) => b.amount - a.amount);
  for (const entry of withPhotos) {
    const places = byDate.get(entry.entryDate) ?? [];
    if (places.some((place) => place.mapUrl === entry.mapUrl)) continue;
    places.push({
      name: entry.mapPlaceName || entry.memo || entry.categoryName || "장소",
      mapUrl: entry.mapUrl,
      photos: entry.mapImageUrls,
    });
    byDate.set(entry.entryDate, places);
  }
  return byDate;
};

/** 못 받은 사진은 숨긴다. */
const PlaceImg = ({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
};

const Polaroid = ({ src, className }: { src: string; className?: string }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <span
      data-slot="calendar-polaroid"
      className={cn(
        "block rounded-[2px] bg-white p-[2px] pb-[5px] shadow-[0_1px_3px_rgb(60_20_25/0.28)] md:p-[3px] md:pb-2",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="aspect-square w-full rounded-[1px] object-cover"
      />
    </span>
  );
};

/**
 * 칸 구석에 살짝 기울여 붙인 폴라로이드. 장소가 두 곳 이상이면 두 번째 장소 사진이 뒤에 겹친다.
 * 좁은 화면은 금액 아래 칸 흐름 안에, 넓은 화면은 칸 오른쪽 아래에 띄워 둔다.
 */
export const PolaroidStack = ({
  places,
  className,
}: {
  places: DayPlace[];
  className?: string;
}) => {
  if (!places.length) return null;
  const [front, back] = places;
  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none relative block w-6 md:w-10", className)}
    >
      {back && (
        <Polaroid
          src={back.photos[0]}
          className="absolute inset-0 translate-x-[-4px] translate-y-[-2px] rotate-[7deg] md:translate-x-[-7px] md:translate-y-[-3px]"
        />
      )}
      <Polaroid src={front.photos[0]} className="relative -rotate-6" />
    </span>
  );
};

/**
 * 마우스를 올리거나 키보드로 칸에 오면 그날 간 곳의 사진을 미리 보여 준다.
 * 터치 화면에서는 열리지 않고, 날짜를 누르면 아래 내역의 사진 띠에서 본다.
 */
export const DayPlacesPreview = ({
  date,
  places,
  children,
}: {
  date: string;
  places: DayPlace[];
  children: ReactElement;
}) => {
  const shown = places.slice(0, PREVIEW_PLACES);
  const rest = places.length - shown.length;
  return (
    <HoverCard>
      <HoverCardTrigger delay={250} render={children} />
      <HoverCardContent
        side="top"
        sideOffset={6}
        aria-label={`${formatDayKo(date)} 간 곳`}
        className="w-72 space-y-2.5 rounded-xl bg-background p-3 text-foreground ring-border"
      >
        <p className="flex items-baseline justify-between gap-2 text-[12px]">
          <span className="font-medium text-foreground">{formatDayKo(date)}</span>
          <span className="text-muted-foreground">장소 {places.length}곳</span>
        </p>
        {shown.map((place) => (
          <div key={place.mapUrl} className="space-y-1">
            <p className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{place.name}</span>
            </p>
            <div className="grid grid-cols-3 gap-1">
              {place.photos.slice(0, PREVIEW_PHOTOS).map((photo, index) => (
                <PlaceImg
                  key={photo}
                  src={photo}
                  alt={`${place.name} 사진 ${index + 1}`}
                  className="aspect-[4/3] w-full rounded-md bg-muted"
                />
              ))}
            </div>
          </div>
        ))}
        {rest > 0 && <p className="text-[11px] text-muted-foreground">외 {rest}곳</p>}
      </HoverCardContent>
    </HoverCard>
  );
};
