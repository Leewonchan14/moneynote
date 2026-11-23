export const MAX_MAP_URL_LENGTH = 1000;

/**
 * 지도 앱의 공유 문구("[네이버 지도] 가게 이름 주소 https://naver.me/...")를 붙여도
 * 그 안의 첫 http(s) 링크만 남긴다. 링크가 없으면 입력을 그대로 돌려준다.
 */
export const extractMapUrl = (value: string): string =>
  value.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? value.trim();

export const isNaverHost = (host: string): boolean =>
  host === "naver.me" || host === "naver.com" || host.endsWith(".naver.com");

/** 네이버 지도 링크인지 본다. 단축 링크(naver.me)도 포함한다. */
export const isNaverMapUrl = (value: string): boolean =>
  URL.canParse(value) && isNaverHost(new URL(value).hostname);

/** 화면에서 열어도 되는 http(s) 주소인지 본다. */
export const isHttpUrl = (value: string): boolean => {
  const raw = extractMapUrl(value);
  if (!URL.canParse(raw)) return false;
  const { protocol } = new URL(raw);
  return protocol === "https:" || protocol === "http:";
};

/**
 * 크게 볼 때 쓰는 사진 주소. 저장한 주소는 네이버 이미지 서버의 640×380 크기라
 * 같은 서버의 1200×800 크기로 바꾼다. 다른 주소는 그대로 둔다.
 */
export const toLargePlacePhotoUrl = (url: string): string =>
  url.startsWith("https://search.pstatic.net/")
    ? url.replace(/([?&]type=)f640_380(?=&|$)/, "$1f1200_800")
    : url;
