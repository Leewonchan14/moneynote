"use client";

import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

import {
  clamp01,
  easeOutBack,
  fitDistance,
  introElapsed,
  isTap,
  LABEL_CLASS,
  LABEL_Z_INDEX,
  useIntroCamera,
  usePrefersReducedMotion,
  type IntroClock,
} from "@/components/ledger/three/scene-utils";
import { kst } from "@/lib/kst";
import { formatCompactWon } from "@/lib/ledger/format";

export type CityDay = {
  date: string;
  expense: number;
  /** 그날 지출이 가장 많은 분류 색. 지출이 없으면 null. */
  color: string | null;
};

export type CityTrip = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  /** 깃발 색(진한 색)과 여행 지구 바닥 색(옅은 색). */
  color: string;
  tint: string;
};

interface Props {
  month: string;
  days: CityDay[];
  trips: CityTrip[];
  activeDay: string;
  today: string;
  onSelectDay: (date: string) => void;
}

const FOV = 35;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** 바닥 텍스처 해상도: 칸 하나가 128px. */
const PX = 128;
const BOARD_HALF_W = 3.6;
const HEADER = 0.7;
const FOOT = 0.58;
/** 칸 왼쪽 위의 날짜 숫자가 보이게 건물을 오른쪽 아래로 조금 민다. */
const NUDGE = 0.07;
const MAX_HEIGHT = 2.6;
const FALLBACK_COLOR = "#6C6663";

const CAMERA_INTRO = 1.3;
const FINAL_POLAR = 0.92;
const FINAL_AZIMUTH = -0.38;

/** 바닥이 y=0에 오도록 밑면을 원점으로 옮긴 상자. 높이는 scale.y로 정한다. */
const buildingGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

type Cell = {
  date: string;
  day: number;
  weekday: number;
  x: number;
  z: number;
  expense: number;
  color: string | null;
  height: number;
  /** 지난 날인데 지출이 없으면 나무를 심는다. */
  noSpend: boolean;
  /** 이 날이 든 여행의 바닥 색. 여행이 겹치면 먼저 시작한 쪽. */
  tripTint: string | null;
};

/** 이 달에 걸친 여행 하나. 깃발은 이 달에 든 첫날 칸에 꽂는다. */
type TripDistrict = CityTrip & { cells: Cell[]; flagCell: Cell; poleHeight: number };

type Layout = {
  cells: Cell[];
  trips: TripDistrict[];
  rows: number;
  zMin: number;
  zMax: number;
};

const buildLayout = (
  month: string,
  days: CityDay[],
  trips: CityTrip[],
  today: string
): Layout => {
  const first = kst(`${month}-01`);
  const startWeekday = first.day();
  const daysInMonth = first.daysInMonth();
  const rows = Math.ceil((startWeekday + daysInMonth) / 7);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const maxExpense = Math.max(0, ...days.map((day) => day.expense));
  const monthTrips = trips
    .filter((trip) => trip.startDate <= `${month}-31` && trip.endDate >= `${month}-01`)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
  const tripOf = (date: string) =>
    monthTrips.find((trip) => trip.startDate <= date && date <= trip.endDate);

  const cells = Array.from({ length: daysInMonth }, (_, index): Cell => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const slot = startWeekday + index;
    const expense = byDate.get(date)?.expense ?? 0;
    return {
      date,
      day: index + 1,
      weekday: slot % 7,
      x: (slot % 7) - 3,
      z: Math.floor(slot / 7) - (rows - 1) / 2,
      expense,
      color: byDate.get(date)?.color ?? null,
      // 작은 지출도 보이도록 제곱근으로 줄인다.
      height: expense > 0 ? 0.12 + MAX_HEIGHT * Math.sqrt(expense / maxExpense) : 0,
      noSpend: expense === 0 && date < today,
      tripTint: tripOf(date)?.tint ?? null,
    };
  });

  const districts = monthTrips.flatMap((trip): TripDistrict[] => {
    const tripCells = cells.filter(
      (cell) => trip.startDate <= cell.date && cell.date <= trip.endDate
    );
    if (!tripCells.length) return [];
    // 여행 기간의 가장 높은 건물보다 깃발이 위에 오게 깃대 높이를 정한다.
    const tallest = Math.max(...tripCells.map((cell) => cell.height));
    const poleHeight = Math.min(3.4, Math.max(1.7, tallest + 0.8));
    return [{ ...trip, cells: tripCells, flagCell: tripCells[0], poleHeight }];
  });

  return {
    cells,
    trips: districts,
    rows,
    zMin: -(rows - 1) / 2 - 0.5 - HEADER,
    zMax: (rows - 1) / 2 + 0.5 + 0.12,
  };
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/** 달력 칸과 날짜 숫자를 그린 바닥 텍스처. 위에서 보면 평범한 달력처럼 보인다. */
const drawBoard = (layout: Layout, today: string) => {
  const width = BOARD_HALF_W * 2;
  const depth = layout.zMax - layout.zMin;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * PX);
  canvas.height = Math.round(depth * PX);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const toX = (x: number) => (x + BOARD_HALF_W) * PX;
  const toY = (z: number) => (z - layout.zMin) * PX;

  ctx.fillStyle = "#f6f5f3";
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 0.3 * PX);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 34px system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif";
  WEEKDAYS.forEach((label, index) => {
    ctx.fillStyle = index === 6 ? "#8a8a8a" : "#555555";
    ctx.fillText(label, toX(index - 3), toY(layout.zMin + HEADER / 2 + 0.12));
  });

  // 여행 기간은 주마다 한 덩어리 띠로 칠해 '여행 지구'처럼 보이게 한다.
  for (const trip of layout.trips) {
    const rows = new Map<number, Cell[]>();
    for (const cell of trip.cells) rows.set(cell.z, [...(rows.get(cell.z) ?? []), cell]);
    ctx.fillStyle = trip.tint;
    for (const row of rows.values()) {
      const left = Math.min(...row.map((cell) => cell.x));
      const right = Math.max(...row.map((cell) => cell.x));
      roundRect(
        ctx,
        toX(left - 0.5 + 0.02),
        toY(row[0].z - 0.5 + 0.02),
        (right - left + 1 - 0.04) * PX,
        (1 - 0.04) * PX,
        0.16 * PX
      );
      ctx.fill();
    }
  }

  const inset = 0.05;
  for (const cell of layout.cells) {
    const x = toX(cell.x - 0.5 + inset);
    const y = toY(cell.z - 0.5 + inset);
    const size = (1 - inset * 2) * PX;
    ctx.fillStyle = cell.tripTint ?? (cell.noSpend ? "#e3eedf" : "#ffffff");
    roundRect(ctx, x, y, size, size, 0.12 * PX);
    ctx.fill();
    if (cell.date === today) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#262626";
      ctx.stroke();
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "600 26px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = cell.weekday === 6 ? "#8a8a8a" : "#3a3a3a";
    ctx.fillText(String(cell.day), x + 0.07 * PX, y + 0.06 * PX);
  }
  return canvas;
};

const Board = ({ layout, today }: { layout: Layout; today: string }) => {
  const texture = useMemo(() => {
    const map = new THREE.CanvasTexture(drawBoard(layout, today));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return map;
  }, [layout, today]);
  useEffect(() => () => texture.dispose(), [texture]);

  const depth = layout.zMax - layout.zMin;
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, 0, (layout.zMin + layout.zMax) / 2]}
      receiveShadow
    >
      <planeGeometry args={[BOARD_HALF_W * 2, depth]} />
      <meshStandardMaterial map={texture} transparent roughness={1} />
    </mesh>
  );
};

/** 칸마다 조금씩 늦게 솟아 1일부터 차례로 올라오는 느낌을 준다. */
const riseDelay = (day: number) => 0.35 + day * 0.025;

const Building = ({
  cell,
  selected,
  intro,
  onSelect,
}: {
  cell: Cell;
  selected: boolean;
  intro: RefObject<IntroClock>;
  onSelect: (date: string) => void;
}) => {
  const mesh = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const color = cell.color ?? FALLBACK_COLOR;

  useFrame((state) => {
    const t = introElapsed(intro.current, state);
    const grow = easeOutBack(clamp01((t - riseDelay(cell.day)) / 0.7));
    if (mesh.current) mesh.current.scale.y = Math.max(0.0001, cell.height * grow);
  });

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (isTap(event)) onSelect(cell.date);
  };

  return (
    <group position={[cell.x + NUDGE, 0, cell.z + NUDGE]} scale={[FOOT, 1, FOOT]}>
      <mesh
        ref={mesh}
        geometry={buildingGeometry}
        castShadow
        receiveShadow
        onClick={select}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
      >
        <meshStandardMaterial
          color={color}
          roughness={0.6}
          emissive={color}
          emissiveIntensity={selected ? 0.55 : hovered ? 0.25 : 0}
        />
      </mesh>
    </group>
  );
};

const Tree = ({ cell, intro }: { cell: Cell; intro: RefObject<IntroClock> }) => {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = introElapsed(intro.current, state);
    const grow = easeOutBack(clamp01((t - riseDelay(cell.day)) / 0.6));
    group.current?.scale.setScalar(Math.max(0.0001, grow));
  });
  return (
    <group ref={group} position={[cell.x + NUDGE, 0, cell.z + NUDGE]}>
      <mesh position-y={0.09} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 0.18, 8]} />
        <meshStandardMaterial color="#8a6a50" roughness={0.9} />
      </mesh>
      <mesh position-y={0.36} castShadow>
        <coneGeometry args={[0.17, 0.4, 10]} />
        <meshStandardMaterial color="#7da36f" roughness={0.8} />
      </mesh>
    </group>
  );
};

const FLAG_WIDTH = 1.3;
const FLAG_HEIGHT = 0.62;
/** 처음 솟은 뒤와 깃발을 누를 때 이만큼 펄럭이고 멈춘다(배터리 아끼기). */
const WAVE_SECONDS = 4;

const drawFlag = (trip: TripDistrict) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = trip.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 92;
  do {
    ctx.font = `700 ${size}px system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif`;
    size -= 4;
  } while (ctx.measureText(trip.name).width > canvas.width - 60 && size > 40);
  // 가장 작은 글씨로도 넘칠 때만 말줄임한다.
  const maxWidth = canvas.width - 60;
  let label = trip.name;
  if (ctx.measureText(label).width > maxWidth) {
    while (ctx.measureText(`${label}…`).width > maxWidth && label.length > 1) {
      label = label.slice(0, -1);
    }
    label = `${label}…`;
  }
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 4);
  return canvas;
};

/** 깃발 천. 깃대 쪽(왼쪽 끝)은 고정하고 바깥으로 갈수록 크게 흔든다. */
const flagGeometry = () =>
  new THREE.PlaneGeometry(FLAG_WIDTH, FLAG_HEIGHT, 24, 4).translate(FLAG_WIDTH / 2, 0, 0);

const Flag = ({
  trip,
  intro,
  onSelect,
}: {
  trip: TripDistrict;
  intro: RefObject<IntroClock>;
  onSelect: (date: string) => void;
}) => {
  const cell = trip.flagCell;
  const group = useRef<THREE.Group>(null);
  const cloth = useRef<THREE.Mesh>(null);
  const rest = useMemo(() => flagGeometry(), []);
  const clothGeometry = useMemo(() => flagGeometry(), []);
  const invalidate = useThree((state) => state.invalidate);
  const texture = useMemo(() => {
    const map = new THREE.CanvasTexture(drawFlag(trip));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return map;
  }, [trip]);
  useEffect(
    () => () => {
      rest.dispose();
      clothGeometry.dispose();
      texture.dispose();
    },
    [rest, clothGeometry, texture]
  );
  // 펄럭이기 시작한 시각(장면 시계 기준). 처음에는 깃발이 다 솟은 시각으로 잡는다.
  const waveAt = useRef<number | null>(null);
  const waveAgain = useRef(false);

  // 토요일 칸이면 판 밖으로 나가지 않게 깃발을 왼쪽으로 단다.
  const side = cell.weekday === 6 ? -1 : 1;
  const pole: [number, number, number] = [cell.x + 0.36 * side, 0, cell.z - 0.36];

  useFrame((state) => {
    const t = introElapsed(intro.current, state);
    const rise = riseDelay(cell.day) + 0.15;
    const grow = easeOutBack(clamp01((t - rise) / 0.6));
    group.current?.scale.set(1, Math.max(0.0001, grow), 1);

    const now = state.clock.elapsedTime;
    if (waveAt.current === null) waveAt.current = now + Math.max(0, rise + 0.6 - t);
    if (waveAgain.current) {
      waveAgain.current = false;
      waveAt.current = now;
    }
    const waving = now - waveAt.current;
    // 다 펄럭이고 나면 살짝 휜 채로 멈춘다.
    const strength = clamp01(1 - Math.max(0, waving) / WAVE_SECONDS) * 0.8 + 0.2;
    const mesh = cloth.current;
    if (!mesh) return;
    const position = mesh.geometry.attributes.position;
    const base = rest.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      const x = base.getX(index);
      const along = x / FLAG_WIDTH;
      const phase = x * 7 - now * 6;
      position.setZ(index, Math.sin(phase) * 0.09 * along * strength);
      position.setY(index, base.getY(index) - along * along * 0.06);
    }
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    if (waving < WAVE_SECONDS) state.invalidate();
  });

  const wave = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (!isTap(event)) return;
    waveAgain.current = true;
    invalidate();
    onSelect(cell.date);
  };

  return (
    <group ref={group} position={pole}>
      <mesh position-y={trip.poleHeight / 2} castShadow onClick={wave}>
        <cylinderGeometry args={[0.025, 0.025, trip.poleHeight, 8]} />
        <meshStandardMaterial color="#8d8a85" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position-y={trip.poleHeight + 0.03}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshStandardMaterial color="#c9a227" roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh
        ref={cloth}
        geometry={clothGeometry}
        position-y={trip.poleHeight - FLAG_HEIGHT / 2}
        // 왼쪽으로 달 때는 뒤집지 않고 돌려서 단다(글자가 거울처럼 보이지 않게).
        rotation-y={side < 0 ? Math.PI : 0}
        castShadow
        onClick={wave}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <meshStandardMaterial
          map={texture}
          side={THREE.DoubleSide}
          roughness={0.85}
          onBeforeCompile={(shader) => {
            // 뒤에서 봐도 글자가 뒤집혀 보이지 않게 뒷면은 가로로 뒤집어 읽는다.
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <map_fragment>",
              `#ifdef USE_MAP
  vec2 flagUv = gl_FrontFacing ? vMapUv : vec2(1.0 - vMapUv.x, vMapUv.y);
  diffuseColor *= texture2D(map, flagUv);
#endif`
            );
          }}
        />
      </mesh>
    </group>
  );
};

const CityScene = ({
  month,
  days,
  trips,
  activeDay,
  today,
  onSelectDay,
  reduced,
}: Props & { reduced: boolean }) => {
  const layout = useMemo(
    () => buildLayout(month, days, trips, today),
    [month, days, trips, today]
  );
  const intro = useRef<IntroClock>({ start: -1, skip: reduced });
  const size = useThree((state) => state.size);
  const target = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  const distance =
    fitDistance(
      BOARD_HALF_W + 0.2,
      (layout.zMax - layout.zMin) / 2 + 0.2,
      FOV,
      size.width / size.height
    ) * 1.12;

  // 위에서 내려다본 평범한 달력에서 시작해 비스듬한 도시 시점으로 기운다.
  const controlsOn = useIntroCamera({
    intro,
    target,
    distance,
    from: { polar: 0.0001, azimuth: 0 },
    to: { polar: FINAL_POLAR, azimuth: FINAL_AZIMUTH },
    delay: 0.15,
    duration: CAMERA_INTRO,
    total: riseDelay(31) + 0.8,
  });

  const selected = layout.cells.find((cell) => cell.date === activeDay);

  return (
    <>
      <ambientLight intensity={1.1} />
      <hemisphereLight args={["#ffffff", "#e8e4dc", 0.6]} />
      <directionalLight
        position={[4, 9, 6]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0005}
      />

      <Board layout={layout} today={today} />

      {selected && (
        <mesh rotation-x={-Math.PI / 2} position={[selected.x, 0.003, selected.z]}>
          <planeGeometry args={[0.92, 0.92]} />
          <meshBasicMaterial color="#171717" transparent opacity={0.12} />
        </mesh>
      )}

      {layout.cells.map((cell) =>
        cell.height > 0 ? (
          <Building
            key={cell.date}
            cell={cell}
            selected={cell.date === activeDay}
            intro={intro}
            onSelect={onSelectDay}
          />
        ) : cell.noSpend ? (
          <Tree key={cell.date} cell={cell} intro={intro} />
        ) : null
      )}

      {layout.trips.map((trip) => (
        <Flag key={trip.id} trip={trip} intro={intro} onSelect={onSelectDay} />
      ))}

      {/* 바닥(빈 칸)을 눌러도 그 날을 고를 수 있게 투명한 판을 깐다. */}
      {layout.cells.map((cell) => (
        <mesh
          key={`hit-${cell.date}`}
          rotation-x={-Math.PI / 2}
          position={[cell.x, 0.001, cell.z]}
          onClick={(event) => {
            event.stopPropagation();
            if (isTap(event)) onSelectDay(cell.date);
          }}
        >
          <planeGeometry args={[0.95, 0.95]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}

      {selected && controlsOn && (
        <Html
          position={[selected.x + NUDGE, selected.height + 0.35, selected.z + NUDGE]}
          center
          zIndexRange={LABEL_Z_INDEX}
        >
          <div className={LABEL_CLASS}>
            {selected.expense > 0
              ? `-${formatCompactWon(selected.expense)}`
              : selected.noSpend
                ? "무지출"
                : "기록 없음"}
          </div>
        </Html>
      )}

      <OrbitControls
        makeDefault
        enabled={controlsOn}
        enablePan={false}
        enableDamping
        target={target}
        minDistance={distance * 0.45}
        maxDistance={distance * 1.5}
        maxPolarAngle={1.3}
      />
    </>
  );
};

/** 달력 칸이 건물로 솟는 '지출 도시'. 높이는 그날 지출, 색은 가장 많이 쓴 분류. */
export default function SpendCity(props: Props) {
  const reduced = usePrefersReducedMotion();
  useEffect(() => () => void (document.body.style.cursor = ""), []);

  return (
    <div
      className="h-[340px] w-full overflow-hidden rounded-lg md:h-[440px]"
      aria-label={`${props.month} 지출 도시`}
      data-testid="spend-city"
    >
      <Canvas
        flat
        shadows="percentage"
        dpr={[1, 2]}
        frameloop="demand"
        camera={{ fov: FOV, near: 0.1, far: 200, position: [0, 30, 0.001] }}
      >
        <CityScene key={props.month} {...props} reduced={reduced} />
      </Canvas>
    </div>
  );
}
