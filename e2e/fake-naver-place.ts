import { createServer } from "node:http";

import { test as base } from "./helpers";

/**
 * 가짜 네이버 플레이스 서버. 앱의 NAVER_PLACE_ORIGIN을 이 서버로 두어
 * 테스트와 데모 녹화가 실제 네이버에 접속하지 않게 한다.
 */

export interface FakePlace {
  /** og:title. 실제처럼 "장소 이름 : 네이버" 꼴로 쓴다. */
  title: string;
  /** 상단 사진 목록의 원본 주소. 비우면 og:image 한 장만 있는 페이지가 된다. */
  photos: string[];
}

export const FAKE_OG_IMAGE =
  "https://search.pstatic.net/common/?type=f640_380&src=og.jpg";

/** 네이버 플레이스 페이지처럼 상단 사진 목록을 `__APOLLO_STATE__`에 넣는다. 영상은 빠져야 한다. */
const apolloScript = (id: string, originals: string[]) => {
  const state: Record<string, unknown> = { ROOT_QUERY: { __typename: "Query" } };
  originals.forEach((originalUrl, index) => {
    state[`PlaceDetailTopPhotoItem:${id}_photo_${index}`] = {
      mediaFormat: "image",
      video: null,
      originalUrl,
      title: '방문자리뷰 "}{" 괄호',
    };
  });
  state[`PlaceDetailTopPhotoItem:${id}_clip`] = {
    mediaFormat: "video",
    video: { videoId: "v" },
    originalUrl: "https://clip-service-phinf.pstatic.net/clip.jpg",
  };
  return `<script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};window.__PLACE_STATE__ = {};</script>`;
};

/** places(장소 id → 페이지)를 돌려주는 가짜 서버를 띄우고, 앱이 그 서버를 쓰게 하는 test */
export const withFakeNaverPlaces = (places: Record<string, FakePlace>) =>
  base.extend<object, { naverOrigin: string }>({
    naverOrigin: [
      async ({}, provide) => {
        const server = createServer((req, res) => {
          const id = req.url?.match(/^\/place\/(\d+)\/home/)?.[1];
          const place = id ? places[id] : undefined;
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          if (!id || !place) {
            res.end("<title>네이버 플레이스</title>");
            return;
          }
          res.end(
            `<html><head>
              <meta property="og:title" content="${place.title}"/>
              <meta property="og:image" content="${FAKE_OG_IMAGE.replace(/&/g, "&amp;")}"/>
            </head><body>${place.photos.length ? apolloScript(id, place.photos) : ""}</body></html>`
          );
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address !== "object")
          throw new Error("포트를 못 받았어요.");
        await provide(`http://127.0.0.1:${address.port}`);
        await new Promise<void>((resolve) => server.close(() => resolve()));
      },
      { scope: "worker" },
    ],
    appEnv: async ({ naverOrigin }, provide) =>
      provide({ NAVER_PLACE_ORIGIN: naverOrigin }),
  });
