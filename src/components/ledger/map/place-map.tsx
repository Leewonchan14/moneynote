"use client";

import {
  Layer,
  Map,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "@vis.gl/react-maplibre";
import type { FeatureCollection, Point } from "geojson";
import {
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";

import type { LedgerMapPlace } from "@/lib/ledger/map-types";

/**
 * 내역 지도. 배경은 키·한도 없이 쓰는 OpenFreeMap 벡터 지도이고, 핀은 MapLibre 내장
 * 클러스터로 묶는다. 지도 제공자를 바꿀 때는 이 파일만 고치면 된다.
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * MapLibre 6은 worker 파일을 자기 모듈 주소 옆에서 찾는데, 번들 뒤에는 그 자리에 파일이 없어
 * 지도가 빈 채로 남는다. 번들러가 worker 파일을 정적 자산으로 복사하게 하고 그 주소를 알려 준다.
 * (vercel/next.js#99674)
 */
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

/** 핀은 캔버스에 그려 CSS 변수를 못 쓰므로 색을 그대로 쓴다. 고른 핀은 강조색으로 바꾼다. */
const PIN = "#262626";
const PIN_SELECTED = "#e5484d";
const SEOUL = { longitude: 126.978, latitude: 37.5665, zoom: 11 };
const FOCUS_ZOOM = 15;

/** 지도 컨트롤의 접근성 이름을 한국어로 */
const MAP_LOCALE = {
  "NavigationControl.ZoomIn": "확대",
  "NavigationControl.ZoomOut": "축소",
  "AttributionControl.ToggleAttribution": "지도 출처 보기",
  "Map.Title": "지도",
};

const SOURCE_ID = "ledger-places";
const CLUSTER_LAYER = "ledger-clusters";
const POINT_LAYER = "ledger-points";
/** 지도 스타일의 라벨을 한국어로 바꿀 때 건드리지 않는 우리 레이어 */
const OWN_LAYER_PREFIX = "ledger-";

/** 영문·로마자를 함께 쓰는 기본 라벨 대신 한국어 이름을 보여 준다. */
const KOREAN_LABEL: ExpressionSpecification = [
  "coalesce",
  ["get", "name:ko"],
  ["get", "name"],
];

const applyKoreanLabels = (map: MapLibreMap) => {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol" || layer.id.startsWith(OWN_LAYER_PREFIX)) continue;
    const field = map.getLayoutProperty(layer.id, "text-field");
    if (field && JSON.stringify(field).includes('"name')) {
      map.setLayoutProperty(layer.id, "text-field", KOREAN_LABEL);
    }
  }
};

interface Props {
  places: LedgerMapPlace[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export const PlaceMap = ({ places, selectedKey, onSelect }: Props) => {
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);

  const data = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: places.map((place) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [place.lng, place.lat] },
        properties: { key: place.key, name: place.name, visits: place.visits },
      })),
    }),
    [places]
  );

  // 장소 목록(기간·분류)이 바뀌면 모든 핀이 보이게 맞춘다.
  const boundsKey = places.map((place) => place.key).join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !places.length) return;
    if (places.length === 1) {
      map.easeTo({ center: [places[0].lng, places[0].lat], zoom: FOCUS_ZOOM });
      return;
    }
    const lngs = places.map((place) => place.lng);
    const lats = places.map((place) => place.lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 56, maxZoom: FOCUS_ZOOM, duration: 600 }
    );
    // 장소 구성이 바뀔 때만 다시 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, boundsKey]);

  // 목록에서 고른 장소로 지도를 옮긴다.
  useEffect(() => {
    const map = mapRef.current;
    const place = places.find((item) => item.key === selectedKey);
    if (!loaded || !map || !place) return;
    map.easeTo({
      center: [place.lng, place.lat],
      zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
      duration: 500,
    });
    // 고른 장소가 바뀔 때만 옮긴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selectedKey]);

  const handleClick = async (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    const map = mapRef.current;
    if (!feature || !map) return;
    if (feature.layer.id === CLUSTER_LAYER) {
      const source = map.getSource<GeoJSONSource>(SOURCE_ID);
      const clusterId = feature.properties?.cluster_id as number | undefined;
      if (!source || clusterId === undefined) return;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      const [lng, lat] = (feature.geometry as Point).coordinates;
      map.easeTo({ center: [lng, lat], zoom, duration: 500 });
      return;
    }
    const key = feature.properties?.key;
    if (typeof key === "string") onSelect(key);
  };

  const isSelected: ExpressionSpecification = ["==", ["get", "key"], selectedKey ?? ""];

  return (
    // 지도 스타일을 다 읽었는지 테스트가 확인한다.
    <div className="size-full" data-map-ready={loaded || undefined}>
      <Map
        ref={mapRef}
        initialViewState={SEOUL}
        mapStyle={MAP_STYLE_URL}
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={[CLUSTER_LAYER, POINT_LAYER]}
        cursor={hovering ? "pointer" : "grab"}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={handleClick}
        onLoad={(event) => {
          applyKoreanLabels(event.target);
          setLoaded(true);
        }}
        attributionControl={{ compact: true }}
        locale={MAP_LOCALE}
        dragRotate={false}
        touchPitch={false}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Source
          id={SOURCE_ID}
          type="geojson"
          data={data}
          cluster
          clusterRadius={36}
          clusterMaxZoom={14}
        >
          <Layer
            id={CLUSTER_LAYER}
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": PIN,
              "circle-opacity": 0.85,
              "circle-radius": ["step", ["get", "point_count"], 16, 5, 20, 15, 26],
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff",
            }}
          />
          <Layer
            id="ledger-cluster-count"
            type="symbol"
            filter={["has", "point_count"]}
            layout={{
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Noto Sans Bold"],
              "text-size": 13,
              "text-allow-overlap": true,
            }}
            paint={{ "text-color": "#ffffff" }}
          />
          <Layer
            id={POINT_LAYER}
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": ["case", isSelected, PIN_SELECTED, PIN],
              "circle-radius": [
                "+",
                ["step", ["get", "visits"], 8, 2, 10, 4, 12, 8, 14],
                ["case", isSelected, 3, 0],
              ],
              "circle-stroke-width": 2.5,
              "circle-stroke-color": "#ffffff",
            }}
          />
          <Layer
            id="ledger-point-label"
            type="symbol"
            filter={["!", ["has", "point_count"]]}
            layout={{
              "text-field": ["get", "name"],
              "text-font": ["Noto Sans Bold"],
              "text-size": 12,
              "text-offset": [0, 1.3],
              "text-anchor": "top",
              "text-max-width": 8,
              "text-optional": true,
            }}
            paint={{
              "text-color": "#262626",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.5,
            }}
          />
        </Source>
      </Map>
    </div>
  );
};
