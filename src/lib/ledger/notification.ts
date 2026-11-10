import { kst } from "@/lib/kst";

export interface ParsedLedgerNotification {
  entryDate: string;
  entryTime: string | null;
  kind: "expense" | "income";
  amount: number;
  memo: string;
}

const AMOUNT_RE = /(\d[\d,]*)\s*원/g;
const NON_SPENDING_BEFORE_AMOUNT = /(잔액|누적|한도|이용\s*가능)[^\d]{0,6}$/;
const INCOME_RE = /입금|받았|환급|환불|이자|급여/;
const EXPENSE_RE = /출금|결제|승인|사용|이체|지출|보냈/;

const NOISE_PATTERNS: RegExp[] = [
  /\[[^\]]*\]/g,
  /(잔액|누적|한도|이용\s*가능)[^\d]{0,6}\d[\d,]*\s*원/g,
  /\d[\d,]*\s*원/g,
  /\d{4}[./-]\d{1,2}[./-]\d{1,2}/g,
  /\d{1,2}월\s*\d{1,2}일/g,
  /\b\d{1,2}[/.]\d{1,2}\b/g,
  /\b\d{1,2}:\d{2}(:\d{2})?\b/g,
  /토스뱅크|토스|카카오뱅크|모임\s*통장|체크카드|신용카드|일시불|\d+개월/g,
  /입금|출금|결제|승인|이체|사용|지출|완료|알림|되었습니다|됐어요|했어요|보냈어요|받았어요/g,
];

const countSpendingAmounts = (line: string): number =>
  [...line.matchAll(AMOUNT_RE)].filter(
    (match) => !NON_SPENDING_BEFORE_AMOUNT.test(line.slice(0, match.index))
  ).length;

/** 빈 줄로 알림을 나누고, 빈 줄 없이 붙은 여러 알림은 금액이 있는 줄마다 나눈다. */
const splitBlocks = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const amountLines = lines.filter((line) => countSpendingAmounts(line) > 0);
      return amountLines.length > 1 ? amountLines : [lines.join(" ")];
    })
    .filter(Boolean);

const parseDate = (block: string, today: string): string => {
  const pad = (value: string | number) => String(value).padStart(2, "0");
  const full = block.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (full) return `${full[1]}-${pad(full[2])}-${pad(full[3])}`;

  const short =
    block.match(/(\d{1,2})월\s*(\d{1,2})일/) ?? block.match(/\b(\d{1,2})[/.](\d{1,2})\b/);
  if (!short) return today;

  const year = Number(today.slice(0, 4));
  const candidate = `${year}-${pad(short[1])}-${pad(short[2])}`;
  // 1월에 12월 알림을 붙여넣으면 작년 날짜다.
  return candidate > today ? `${year - 1}-${pad(short[1])}-${pad(short[2])}` : candidate;
};

const parseTime = (block: string): string | null => {
  const match = block.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const parseMemo = (block: string): string => {
  const cleaned = NOISE_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, " "),
    block
  );
  const parts = cleaned
    .split(/[\s,|·]+/)
    .map((part) =>
      part
        .replace(/^(에서|으로|로)$/, "")
        .replace(/(에서|으로)$/, "")
        .trim()
    )
    .filter((part) => part && part !== "님");
  return parts.join(" ").slice(0, 200);
};

const isRealDate = (date: string): boolean => kst(date).format("YYYY-MM-DD") === date;

const parseBlock = (block: string, today: string): ParsedLedgerNotification | null => {
  const amountMatch = [...block.matchAll(AMOUNT_RE)].find(
    (match) => !NON_SPENDING_BEFORE_AMOUNT.test(block.slice(0, match.index))
  );
  if (!amountMatch) return null;

  const amount = Number(amountMatch[1].replaceAll(",", ""));
  const entryDate = parseDate(block, today);
  if (!Number.isInteger(amount) || amount < 1 || !isRealDate(entryDate)) return null;

  return {
    entryDate,
    entryTime: parseTime(block),
    kind: INCOME_RE.test(block) && !EXPENSE_RE.test(block) ? "income" : "expense",
    amount,
    memo: parseMemo(block),
  };
};

/** 은행·카드 알림 문장에서 금액, 날짜, 시각, 내용을 뽑는다. 금액이 없는 문단은 건너뛴다. */
export const parseLedgerNotifications = (
  text: string,
  today: string
): ParsedLedgerNotification[] =>
  splitBlocks(text)
    .map((block) => parseBlock(block, today))
    .filter((item): item is ParsedLedgerNotification => item !== null);

const EXPENSE_KEYWORDS: [string, RegExp][] = [
  ["항공", /항공|공항/],
  ["렌트", /렌터카|렌트카|쏘카|그린카/],
  ["카페", /카페|커피|스타벅스|투썸|이디야|메가|컴포즈|빽다방|베이커리/],
  ["교통", /택시|버스|지하철|코레일|KTX|SRT|주유|톨게이트|주차|티머니/i],
  ["숙박", /호텔|모텔|펜션|숙박|에어비앤비|야놀자|여기어때/],
  ["문화", /영화|CGV|롯데시네마|메가박스|전시|공연|노래방|방탈출/i],
  ["쇼핑", /쿠팡|올리브영|무신사|다이소|백화점/],
  ["의료", /약국|병원|의원|치과/],
  [
    "식비",
    /식당|김밥|치킨|피자|고기|국밥|분식|배달의민족|배민|요기요|맥도날드|버거|점심|저녁|아침/,
  ],
];

/** 내용에서 지출 분류를 추측한다. 해당 이름의 분류가 없으면 호출한 쪽에서 분류 없음으로 둔다. */
export const suggestLedgerCategoryName = (
  memo: string,
  kind: "expense" | "income"
): string | null => {
  if (kind !== "expense") return null;
  return EXPENSE_KEYWORDS.find(([, pattern]) => pattern.test(memo))?.[0] ?? null;
};
