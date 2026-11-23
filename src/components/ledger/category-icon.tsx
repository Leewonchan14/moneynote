"use client";

import {
  BedDouble,
  Bone,
  BookOpen,
  Bus,
  Camera,
  Cat,
  Clapperboard,
  Coffee,
  Dog,
  Dumbbell,
  Gamepad2,
  Gift,
  Heart,
  House,
  Landmark,
  Music,
  PawPrint,
  Pill,
  Plane,
  Plus,
  ReceiptText,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  Users,
  Utensils,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import {
  categoryColorOption,
  categoryIconOption,
  defaultCategoryColor,
  type LedgerCategoryColorKey,
  type LedgerCategoryIconKey,
} from "@/lib/ledger/icons";
import { cn } from "@/lib/utils";

const ICONS: Record<LedgerCategoryIconKey, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  bus: Bus,
  basket: ShoppingBasket,
  bag: ShoppingBag,
  clapperboard: Clapperboard,
  pill: Pill,
  house: House,
  bed: BedDouble,
  receipt: ReceiptText,
  wallet: Wallet,
  gift: Gift,
  landmark: Landmark,
  plus: Plus,
  users: Users,
  pawprint: PawPrint,
  dog: Dog,
  cat: Cat,
  bone: Bone,
  heart: Heart,
  stethoscope: Stethoscope,
  plane: Plane,
  dumbbell: Dumbbell,
  book: BookOpen,
  music: Music,
  camera: Camera,
  gamepad: Gamepad2,
  smartphone: Smartphone,
  wrench: Wrench,
  sparkles: Sparkles,
  tag: Tag,
};

interface CategoryIconProps {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: number;
  className?: string;
}

export const CategoryIcon = ({
  icon,
  color,
  size = 30,
  className,
}: CategoryIconProps) => {
  const option = categoryIconOption(icon);
  const Icon = ICONS[option.key];
  const tone = categoryColorOption(color);

  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid shrink-0 place-items-center rounded-[10px]", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: tone.bg,
        color: tone.fg,
      }}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={1.75} />
    </span>
  );
};

/**
 * 장소 대표 사진을 아이콘 자리에 보여 주고, 오른쪽 아래에 분류 아이콘을 작게 붙인다.
 * 사진을 못 받으면 분류 아이콘으로 돌아간다.
 */
const PhotoEntryIcon = ({
  photo,
  icon,
  color,
  size = 30,
  className,
}: {
  photo: string;
  icon: string | null;
  color: string | null;
  size?: number;
  className?: string;
}) => {
  const [broken, setBroken] = useState(false);
  if (broken)
    return <CategoryIcon icon={icon} color={color} size={size} className={className} />;
  const badge = Math.max(12, Math.round(size * 0.42));

  return (
    <span
      aria-hidden="true"
      data-slot="entry-photo"
      className={cn("relative inline-block shrink-0 rounded-[10px]", className)}
      style={{ width: size, height: size }}
    >
      {/* 네이버 이미지 서버에서 바로 받는다. next/image 최적화를 거치지 않는다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="size-full rounded-[inherit] object-cover ring-1 ring-border"
      />
      {size >= 28 && (
        <CategoryIcon
          icon={icon}
          color={color}
          size={badge}
          className="absolute -right-1 -bottom-1 rounded-full ring-2 ring-background"
        />
      )}
    </span>
  );
};

/** 입금은 분류가 없어서 같은 아이콘을 쓴다. 지출에 장소 사진이 있으면 사진을 보여 준다. */
export const EntryIcon = ({
  entry,
  size,
  className,
}: {
  entry: {
    kind: "expense" | "income" | "transfer";
    categoryIcon: string | null;
    categoryColor: string | null;
    /** 네이버 지도 장소 사진. 있으면 첫 사진을 아이콘 자리에 보여 준다. */
    mapImageUrls?: string[];
  };
  size?: number;
  className?: string;
}) =>
  entry.kind === "expense" && entry.mapImageUrls?.[0] ? (
    <PhotoEntryIcon
      // 사진이 바뀌면 못 받은 상태를 다시 시작한다.
      key={entry.mapImageUrls[0]}
      photo={entry.mapImageUrls[0]}
      icon={entry.categoryIcon}
      color={entry.categoryColor}
      size={size}
      className={className}
    />
  ) : entry.kind === "transfer" ? (
    <CategoryIcon
      icon="landmark"
      color={defaultCategoryColor("landmark")}
      size={size}
      className={className}
    />
  ) : entry.kind === "income" ? (
    <CategoryIcon
      icon="wallet"
      color={defaultCategoryColor("wallet")}
      size={size}
      className={className}
    />
  ) : (
    <CategoryIcon
      icon={entry.categoryIcon}
      color={entry.categoryColor}
      size={size}
      className={className}
    />
  );

export const CATEGORY_COLOR_HEX = (color: string | null | undefined) =>
  categoryColorOption(color).fg;

export type { LedgerCategoryColorKey, LedgerCategoryIconKey };
