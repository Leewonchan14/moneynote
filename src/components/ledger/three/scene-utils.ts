import { useFrame, useThree, type RootState } from "@react-three/fiber";
import { useRef, useState, type RefObject } from "react";
import * as THREE from "three";

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
/** 끝에서 살짝 넘쳤다가 돌아온다. 건물이 '퐁' 솟는 느낌. */
export const easeOutBack = (t: number) => {
  const c1 = 1.4;
  return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** 장면이 뜬 시각. 첫 프레임에서 정해지고, skip이면 처음부터 연출이 끝난 상태다. */
export type IntroClock = { start: number; skip: boolean };

/** 장면이 처음 그려진 뒤 흐른 시간(초). */
export const introElapsed = (intro: IntroClock, state: RootState) => {
  if (intro.skip) return Number.POSITIVE_INFINITY;
  if (intro.start < 0) intro.start = state.clock.elapsedTime;
  return state.clock.elapsedTime - intro.start;
};

/** 동작 줄이기를 켠 기기에서는 등장 연출을 건너뛴다. */
export const usePrefersReducedMotion = () =>
  useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )[0];

/** 가로 halfWidth, 세로 halfHeight 크기의 영역이 화면에 다 들어오는 카메라 거리. */
export const fitDistance = (
  halfWidth: number,
  halfHeight: number,
  fovDeg: number,
  aspect: number
) => {
  const vertical = THREE.MathUtils.degToRad(fovDeg) / 2;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return Math.max(halfHeight / Math.tan(vertical), halfWidth / Math.tan(horizontal));
};

/** target을 중심으로 polar(위에서 기운 각), azimuth(돈 각) 위치에 카메라를 놓는다. */
export const placeOnSphere = (
  out: THREE.Vector3,
  target: THREE.Vector3,
  distance: number,
  polar: number,
  azimuth: number
) =>
  out.set(
    target.x + distance * Math.sin(polar) * Math.sin(azimuth),
    target.y + distance * Math.cos(polar),
    target.z + distance * Math.sin(polar) * Math.cos(azimuth)
  );

type CameraPose = { polar: number; azimuth: number };

/**
 * 등장 연출 동안 카메라를 from 자세에서 to 자세로 옮기고, 연출이 끝나면 true를 돌려준다.
 * 그 뒤로는 OrbitControls가 카메라를 넘겨받는다.
 */
export const useIntroCamera = ({
  intro,
  target,
  distance,
  from,
  to,
  delay,
  duration,
  total,
}: {
  intro: RefObject<IntroClock>;
  target: THREE.Vector3;
  distance: number;
  from: CameraPose;
  to: CameraPose;
  delay: number;
  duration: number;
  /** 장면 전체 연출(막대가 다 솟을 때까지) 길이. 이때 조작을 넘긴다. */
  total: number;
}) => {
  const camera = useThree((state) => state.camera);
  const done = useRef(false);
  const [ready, setReady] = useState(false);

  useFrame((state) => {
    if (done.current) return;
    const t = introElapsed(intro.current, state);
    const p = easeInOutCubic(clamp01((t - delay) / duration));
    placeOnSphere(
      camera.position,
      target,
      distance,
      lerp(from.polar, to.polar, p),
      lerp(from.azimuth, to.azimuth, p)
    );
    camera.lookAt(target);
    if (t >= total) {
      done.current = true;
      setReady(true);
    } else {
      state.invalidate();
    }
  });

  return ready;
};

/** 드래그로 돌리다 손을 뗀 것은 클릭으로 치지 않는다. */
export const isTap = (event: { delta: number }) => event.delta <= 6;

/** 장면 위에 띄우는 HTML 라벨이 앱의 팝오버·다이얼로그를 덮지 않게 한다. */
export const LABEL_Z_INDEX: [number, number] = [10, 0];

export const LABEL_CLASS =
  "pointer-events-none whitespace-nowrap rounded-md bg-background/95 px-1.5 py-0.5 text-[11px] font-medium text-foreground tabular-nums shadow-sm ring-1 ring-foreground/10";
