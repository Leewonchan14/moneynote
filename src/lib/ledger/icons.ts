export const CATEGORY_COLOR_OPTIONS = [
  { key: "peach", label: "피치", bg: "#FBE7E2", fg: "#B85F52" },
  { key: "latte", label: "라떼", bg: "#F3E6D6", fg: "#94623E" },
  { key: "blue", label: "블루", bg: "#E3EDF9", fg: "#4A6C9C" },
  { key: "sage", label: "세이지", bg: "#E7F0E4", fg: "#5D7D56" },
  { key: "pink", label: "핑크", bg: "#F8E4EE", fg: "#A95878" },
  { key: "lavender", label: "라벤더", bg: "#ECE6F7", fg: "#6A5896" },
  { key: "red", label: "레드", bg: "#FAE5E5", fg: "#AE5858" },
  { key: "clay", label: "클레이", bg: "#F1E8E0", fg: "#86644D" },
  { key: "teal", label: "틸", bg: "#E0EFEE", fg: "#4B7C77" },
  { key: "neutral", label: "뉴트럴", bg: "#EEEDEC", fg: "#6C6663" },
] as const;

export type LedgerCategoryColorKey = (typeof CATEGORY_COLOR_OPTIONS)[number]["key"];

export const CATEGORY_ICON_OPTIONS = [
  {
    key: "utensils",
    label: "식사",
    keywords: ["식비", "식사", "밥", "음식", "외식"],
    defaultColor: "peach",
  },
  {
    key: "coffee",
    label: "카페",
    keywords: ["카페", "커피", "디저트", "베이커리"],
    defaultColor: "latte",
  },
  {
    key: "bus",
    label: "교통",
    keywords: ["교통", "버스", "지하철", "택시", "렌터카", "렌트"],
    defaultColor: "blue",
  },
  {
    key: "basket",
    label: "생활",
    keywords: ["생활", "장보기", "마트", "생필품"],
    defaultColor: "sage",
  },
  {
    key: "bag",
    label: "쇼핑",
    keywords: ["쇼핑", "옷", "구매"],
    defaultColor: "pink",
  },
  {
    key: "clapperboard",
    label: "문화",
    keywords: ["문화", "영화", "공연", "전시"],
    defaultColor: "lavender",
  },
  {
    key: "pill",
    label: "의료",
    keywords: ["의료", "약", "병원", "건강"],
    defaultColor: "red",
  },
  {
    key: "house",
    label: "주거",
    keywords: ["주거", "집", "월세", "관리비"],
    defaultColor: "clay",
  },
  {
    key: "bed",
    label: "숙박",
    keywords: ["숙박", "숙소", "호텔", "펜션"],
    defaultColor: "teal",
  },
  {
    key: "receipt",
    label: "기타",
    keywords: ["기타", "영수증", "잡비"],
    defaultColor: "neutral",
  },
  {
    key: "wallet",
    label: "급여",
    keywords: ["급여", "월급", "소득"],
    defaultColor: "sage",
  },
  {
    key: "gift",
    label: "용돈",
    keywords: ["용돈", "선물", "경조사"],
    defaultColor: "pink",
  },
  {
    key: "landmark",
    label: "이자",
    keywords: ["이자", "은행", "계좌"],
    defaultColor: "blue",
  },
  {
    key: "plus",
    label: "수입 기타",
    keywords: ["수입", "기타"],
    defaultColor: "neutral",
  },
  {
    key: "users",
    label: "모임",
    keywords: ["모임", "공동", "회비", "통장"],
    defaultColor: "teal",
  },
  {
    key: "pawprint",
    label: "반려동물",
    keywords: ["반려동물", "강아지", "고양이", "산책"],
    defaultColor: "sage",
  },
  {
    key: "dog",
    label: "강아지",
    keywords: ["강아지", "댕댕이"],
    defaultColor: "peach",
  },
  {
    key: "cat",
    label: "고양이",
    keywords: ["고양이", "냥이"],
    defaultColor: "latte",
  },
  {
    key: "bone",
    label: "간식",
    keywords: ["간식", "먹이"],
    defaultColor: "clay",
  },
  {
    key: "heart",
    label: "돌봄",
    keywords: ["돌봄", "기부", "마음"],
    defaultColor: "pink",
  },
  {
    key: "stethoscope",
    label: "병원",
    keywords: ["병원", "진료", "건강"],
    defaultColor: "red",
  },
  {
    key: "plane",
    label: "여행",
    keywords: ["여행", "항공", "비행기"],
    defaultColor: "blue",
  },
  {
    key: "dumbbell",
    label: "운동",
    keywords: ["운동", "헬스", "PT"],
    defaultColor: "sage",
  },
  {
    key: "book",
    label: "교육",
    keywords: ["교육", "공부", "책", "학원"],
    defaultColor: "lavender",
  },
  {
    key: "music",
    label: "음악",
    keywords: ["음악", "악기", "공연"],
    defaultColor: "lavender",
  },
  {
    key: "camera",
    label: "사진",
    keywords: ["사진", "카메라", "촬영"],
    defaultColor: "clay",
  },
  {
    key: "gamepad",
    label: "게임",
    keywords: ["게임", "오락"],
    defaultColor: "pink",
  },
  {
    key: "smartphone",
    label: "구독",
    keywords: ["구독", "통신", "휴대폰", "앱"],
    defaultColor: "blue",
  },
  {
    key: "wrench",
    label: "수리",
    keywords: ["수리", "공구", "고장"],
    defaultColor: "neutral",
  },
  {
    key: "sparkles",
    label: "취미",
    keywords: ["취미", "관심", "기타"],
    defaultColor: "lavender",
  },
  {
    key: "tag",
    label: "태그",
    keywords: ["태그", "기타", "분류"],
    defaultColor: "neutral",
  },
] as const;

export type LedgerCategoryIconKey = (typeof CATEGORY_ICON_OPTIONS)[number]["key"];

const COLOR_BY_KEY = new Map(
  CATEGORY_COLOR_OPTIONS.map((option) => [option.key, option])
);
const ICON_BY_KEY = new Map(CATEGORY_ICON_OPTIONS.map((option) => [option.key, option]));

export const DEFAULT_CATEGORY_ICON: LedgerCategoryIconKey = "tag";
export const DEFAULT_CATEGORY_COLOR: LedgerCategoryColorKey = "neutral";

export const isCategoryIconKey = (value: unknown): value is LedgerCategoryIconKey =>
  typeof value === "string" && ICON_BY_KEY.has(value as LedgerCategoryIconKey);

export const isCategoryColorKey = (value: unknown): value is LedgerCategoryColorKey =>
  typeof value === "string" && COLOR_BY_KEY.has(value as LedgerCategoryColorKey);

export const categoryIconOption = (
  key: string | null | undefined
): (typeof CATEGORY_ICON_OPTIONS)[number] =>
  ICON_BY_KEY.get((key ?? DEFAULT_CATEGORY_ICON) as LedgerCategoryIconKey) ??
  ICON_BY_KEY.get("tag")!;

export const categoryColorOption = (
  key: string | null | undefined
): (typeof CATEGORY_COLOR_OPTIONS)[number] =>
  COLOR_BY_KEY.get((key ?? DEFAULT_CATEGORY_COLOR) as LedgerCategoryColorKey) ??
  COLOR_BY_KEY.get("neutral")!;

export const categoryColorHex = (key: string | null | undefined) =>
  categoryColorOption(key).fg;

/** 이름에 맞는 아이콘을 고른다. 정확히 일치하는 키워드 → 부분 일치 → tag 순서. */
export const suggestCategoryIcon = (name: string): LedgerCategoryIconKey => {
  const value = name.trim().toLowerCase();
  if (!value) return DEFAULT_CATEGORY_ICON;

  const exact = CATEGORY_ICON_OPTIONS.find(
    (option) =>
      option.label.toLowerCase() === value ||
      (option.keywords as readonly string[]).includes(value)
  );
  if (exact) return exact.key;

  const partial = CATEGORY_ICON_OPTIONS.find((option) =>
    option.keywords.some((keyword) => value.includes(keyword.toLowerCase()))
  );
  return partial?.key ?? DEFAULT_CATEGORY_ICON;
};

export const defaultCategoryColor = (icon: string | null | undefined) =>
  categoryIconOption(icon).defaultColor;

/** 기존 기본 분류는 이름만으로 색·아이콘을 backfill할 수 있게 한다. */
export const DEFAULT_CATEGORY_STYLES: Record<
  string,
  { icon: LedgerCategoryIconKey; color: LedgerCategoryColorKey }
> = {
  식비: { icon: "utensils", color: "peach" },
  카페: { icon: "coffee", color: "latte" },
  교통: { icon: "bus", color: "blue" },
  생활: { icon: "basket", color: "sage" },
  쇼핑: { icon: "bag", color: "pink" },
  문화: { icon: "clapperboard", color: "lavender" },
  의료: { icon: "pill", color: "red" },
  주거: { icon: "house", color: "clay" },
  숙박: { icon: "bed", color: "teal" },
  기타: { icon: "receipt", color: "neutral" },
  급여: { icon: "wallet", color: "sage" },
  용돈: { icon: "gift", color: "pink" },
  이자: { icon: "landmark", color: "blue" },
  월급: { icon: "wallet", color: "sage" },
  문화생활: { icon: "clapperboard", color: "lavender" },
  데이트: { icon: "heart", color: "pink" },
  "교통/차량": { icon: "bus", color: "blue" },
  "패션/미용": { icon: "sparkles", color: "pink" },
  개발: { icon: "wrench", color: "neutral" },
  "장비/생활용품": { icon: "basket", color: "sage" },
  보험: { icon: "landmark", color: "teal" },
  건강: { icon: "stethoscope", color: "red" },
  통신: { icon: "smartphone", color: "blue" },
  교육: { icon: "book", color: "latte" },
  가족: { icon: "users", color: "peach" },
  "경/조사": { icon: "gift", color: "clay" },
  "마트/편의점": { icon: "basket", color: "latte" },
};
