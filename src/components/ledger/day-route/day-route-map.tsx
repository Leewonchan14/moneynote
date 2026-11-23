"use client";

import { Layer, Map, Marker, Source, type MapRef } from "@vis.gl/react-maplibre";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";

import {
  applyKoreanLabels,
  MAP_LOCALE,
  MAP_STYLE_URL,
  SEOUL,
} from "@/components/ledger/map/place-map";
import { partialRoute, type DayRouteStop } from "@/lib/ledger/day-route";
import { cn } from "@/lib/utils";

/*
 * 그날의 동선 지도. 배경 지도 설정은 지도 탭(place-map.tsx)과 같다.
 * 정거장 번호는 DOM 마커로 그려, 지도가 GPU 없이 느리게 그려져도 번호·상태는 바로 바뀐다.
 * 선은 재생 루프가 controllerRef.draw()로 매 프레임 직접 바꾼다(React를 다시 그리지 않는다).
 */

/** 캔버스에 그리는 선은 CSS 변수를 못 쓰므로 색을 그대로 쓴다. 핀 색은 지도 탭과 같다. */
const LINE = "#e5484d";
const PREVIEW = "#a3a3a3";
const PADDING = { top: 48, bottom: 48, left: 40, right: 40 };
const STOP_ZOOM = 15;

const PREVIEW_SOURCE = "ledger-route-preview";
const LINE_SOURCE = "ledger-route-line";
const TIP_SOURCE = "ledger-route-tip";

/**
 * 카메라를 어디에 맞출지.
 * - all: 모든 정거장
 * - next: 지금 정거장과 다음 정거장(가는 동안)
 * - arrive: 앞 정거장과 지금 정거장(직접 넘겼을 때)
 * - hold: 그대로 둔다(재생 중 도착했을 때, 이미 화면 안에 있다)
 */
export type DayRouteFocus = "all" | "next" | "arrive" | "hold";

export type DayRouteMapController = {
  /** step번째 정거장까지 잇고, 다음 정거장 쪽으로 travel(0~1)만큼 더 그린다. */
  draw: (step: number, travel: number) => void;
};

interface Props {
  stops: DayRouteStop[];
  step: number;
  focus: DayRouteFocus;
  /** 카메라를 옮기는 시간(ms). 동작 줄이기를 켰으면 0 */
  moveMs: number;
  controllerRef: Ref<DayRouteMapController>;
  onSelect: (index: number) => void;
}

const lineOf = (coordinates: [number, number][]): Feature<LineString> => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates },
  properties: {},
});

const tipOf = (coordinates: [number, number][]): FeatureCollection<Point> => ({
  type: "FeatureCollection",
  features:
    coordinates.length > 0
      ? [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: coordinates.at(-1)! },
            properties: {},
          },
        ]
      : [],
});

const NO_TIP = tipOf([]);

const boundsOf = (points: DayRouteStop[]): [[number, number], [number, number]] => {
  const lngs = points.map((stop) => stop.lng);
  const lats = points.map((stop) => stop.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
};

export const DayRouteMap = ({
  stops,
  step,
  focus,
  moveMs,
  controllerRef,
  onSelect,
}: Props) => {
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  // 지도가 아직 안 떴을 때 그린 선은 떴을 때 다시 그린다.
  const lastDraw = useRef<[number, number]>([step, 0]);

  const preview = useMemo(
    () => lineOf(stops.map((stop) => [stop.lng, stop.lat] as [number, number])),
    [stops]
  );
  // 선 데이터는 정거장이 바뀔 때만 새로 만든다. 렌더마다 새 객체면 그리던 선이 되돌아간다.
  const stepLine = useMemo(() => lineOf(partialRoute(stops, step, 0)), [stops, step]);

  const draw = (nextStep: number, travel: number) => {
    lastDraw.current = [nextStep, travel];
    const map = mapRef.current;
    if (!map) return;
    const coords = partialRoute(stops, nextStep, travel);
    map.getSource<GeoJSONSource>(LINE_SOURCE)?.setData(lineOf(coords));
    // 가는 동안에만 선 끝에 점을 둔다. 정거장에 서 있으면 번호 마커가 그 자리다.
    map.getSource<GeoJSONSource>(TIP_SOURCE)?.setData(tipOf(travel > 0 ? coords : []));
  };
  useImperativeHandle(controllerRef, () => ({ draw }));

  // 정거장을 넘기면(재생·버튼) 선을 그 정거장까지로 맞춘다.
  useEffect(() => {
    if (loaded) draw(step, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, step, stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !stops.length) return;
    const current = stops[Math.min(step, stops.length - 1)];
    const frame = (points: DayRouteStop[]) => {
      if (
        points.length === 1 ||
        points.every((p) => p.lat === points[0].lat && p.lng === points[0].lng)
      ) {
        map.easeTo({
          center: [points[0].lng, points[0].lat],
          zoom: Math.max(map.getZoom(), STOP_ZOOM),
          duration: moveMs,
        });
        return;
      }
      map.fitBounds(boundsOf(points), {
        padding: PADDING,
        maxZoom: STOP_ZOOM,
        duration: moveMs,
      });
    };
    if (focus === "all") frame(stops);
    else if (focus === "next") frame([current, stops[step + 1] ?? current]);
    else if (focus === "arrive") frame([stops[step - 1] ?? current, current]);
    // 정거장·맞출 곳이 바뀔 때만 옮긴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, step, focus]);

  return (
    // 지도 스타일을 다 읽었는지 테스트가 확인한다.
    <div className="size-full" data-map-ready={loaded || undefined}>
      <Map
        ref={mapRef}
        initialViewState={
          stops.length
            ? {
                bounds: boundsOf(stops),
                fitBoundsOptions: { padding: PADDING, maxZoom: STOP_ZOOM },
              }
            : SEOUL
        }
        mapStyle={MAP_STYLE_URL}
        style={{ width: "100%", height: "100%" }}
        onLoad={(event) => {
          applyKoreanLabels(event.target);
          // 좁은 지도에서 펼쳐진 출처 글이 아래쪽 동선을 가리지 않게 접는다. (i)로 다시 펼친다.
          // 출처는 타일 정보를 읽은 뒤에 붙을 수 있어 처음 다 그렸을 때 한 번 더 접는다.
          const collapse = () =>
            event.target
              .getContainer()
              .querySelector(".maplibregl-compact-show")
              ?.classList.remove("maplibregl-compact-show");
          collapse();
          event.target.once("idle", collapse);
          setLoaded(true);
          draw(...lastDraw.current);
        }}
        attributionControl={{ compact: true }}
        locale={MAP_LOCALE}
        dragRotate={false}
        touchPitch={false}
      >
        <Source id={PREVIEW_SOURCE} type="geojson" data={preview}>
          <Layer
            id="ledger-route-preview"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": PREVIEW, "line-width": 2, "line-dasharray": [1, 2] }}
          />
        </Source>
        <Source id={LINE_SOURCE} type="geojson" data={stepLine}>
          <Layer
            id="ledger-route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": LINE, "line-width": 4 }}
          />
        </Source>
        <Source id={TIP_SOURCE} type="geojson" data={NO_TIP}>
          <Layer
            id="ledger-route-tip"
            type="circle"
            paint={{
              "circle-color": LINE,
              "circle-radius": 6,
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff",
            }}
          />
        </Source>
        {stops.map((stop, index) => {
          const state =
            index === step ? "current" : index < step ? "visited" : "upcoming";
          return (
            <Marker
              key={stop.id}
              longitude={stop.lng}
              latitude={stop.lat}
              anchor="center"
              // 지금 정거장 번호가 다른 번호에 가리지 않게 맨 위로 올린다.
              style={{ zIndex: state === "current" ? 2 : state === "visited" ? 1 : 0 }}
            >
              <button
                type="button"
                aria-label={`${index + 1}번째 곳 ${stop.name}`}
                aria-current={state === "current" || undefined}
                data-state={state}
                onClick={() => onSelect(index)}
                className={cn(
                  "grid place-items-center rounded-full border-2 border-white font-semibold tabular-nums shadow-[0_1px_4px_rgb(0_0_0/0.35)] transition-[transform,background-color] duration-200",
                  state === "current"
                    ? "size-8 scale-110 bg-[#e5484d] text-[13px] text-white"
                    : state === "visited"
                      ? "size-6 bg-[#262626] text-[11px] text-white"
                      : "size-6 bg-white text-[11px] text-[#525252] ring-1 ring-[#a3a3a3]"
                )}
              >
                {index + 1}
              </button>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
};
