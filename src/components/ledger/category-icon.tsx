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

/** 입금은 분류가 없어서 같은 아이콘을 쓴다. */
export const EntryIcon = ({
  entry,
  size,
  className,
}: {
  entry: {
    kind: "expense" | "income" | "transfer";
    categoryIcon: string | null;
    categoryColor: string | null;
  };
  size?: number;
  className?: string;
}) =>
  entry.kind === "transfer" ? (
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
