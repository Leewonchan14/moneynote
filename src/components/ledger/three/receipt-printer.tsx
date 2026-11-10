"use client";

import { OrbitControls, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  clamp01,
  easeInOutCubic,
  fitDistance,
  lerp,
  placeOnSphere,
} from "@/components/ledger/three/scene-utils";

interface Props {
  /** drawReceipt로 그린 영수증. 종이 텍스처로 쓴다. */
  receipt: HTMLCanvasElement;
  /** 출력이 끝나고 종이가 날아가면 부른다. */
  onDone: () => void;
}

const FOV = 35;
const PAPER_WIDTH = 2;
/** 슬롯에서 곧게 서는 길이. 그 뒤로는 감열지처럼 뒤로 말린다. */
const STRAIGHT = 2.2;
const CURL_START = 0.6;
const CURL_GROWTH = 0.9;
const CURL_MAX = 3.6;
/** 종이 경로를 적분하는 간격. */
const STEP = 0.01;

const WAIT = 0.5;
const FEED_SPEED = 2.6;
const HOLD = 0.7;
const FLY = 0.9;

const TARGET = new THREE.Vector3(0, 1.45, 0);

/** 프린터에서 종이가 나오고, 다 나오면 찢겨 위로 날아간다. */
const PrinterScene = ({ receipt, onDone }: Props) => {
  const length = (PAPER_WIDTH * receipt.height) / receipt.width;
  const segments = Math.ceil(length * 30);
  const feedTime = length / FEED_SPEED;

  const geometry = useMemo(
    () => new THREE.PlaneGeometry(PAPER_WIDTH, length, 1, segments),
    [length, segments]
  );
  const texture = useMemo(() => {
    const map = new THREE.CanvasTexture(receipt);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return map;
  }, [receipt]);
  useEffect(
    () => () => {
      geometry.dispose();
      texture.dispose();
    },
    [geometry, texture]
  );

  // 매 프레임 다시 쓰는 버퍼라 ref에 둔다.
  const path = useRef({ y: new Float32Array(0), z: new Float32Array(0) });
  const paper = useRef<THREE.Mesh>(null);
  const front = useRef<THREE.MeshStandardMaterial>(null);
  const back = useRef<THREE.MeshStandardMaterial>(null);
  const printer = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const clock = useRef({ start: -1, done: false });

  useFrame((state) => {
    if (clock.current.start < 0) clock.current.start = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - clock.current.start;
    const fed = Math.min(length, Math.max(0, (t - WAIT) * FEED_SPEED));
    const flyRaw = clamp01((t - WAIT - feedTime - HOLD) / FLY);
    const fly = easeInOutCubic(flyRaw);
    const printing = t > WAIT && t < WAIT + feedTime;

    // 슬롯에서부터 종이를 따라가며 위치를 적분한다. 멀수록(먼저 나온 쪽일수록) 많이 말린다.
    const count = Math.max(2, Math.ceil(fed / STEP) + 1);
    if (path.current.y.length < count) {
      const size = Math.ceil(length / STEP) + 2;
      path.current = { y: new Float32Array(size), z: new Float32Array(size) };
    }
    const { y: pathY, z: pathZ } = path.current;
    let y = 0;
    let z = 0;
    let heading = 0;
    pathY[0] = 0;
    pathZ[0] = 0;
    for (let i = 1; i < count; i += 1) {
      const d = i * STEP;
      const curl =
        d < STRAIGHT ? 0 : Math.min(CURL_MAX, CURL_START + CURL_GROWTH * (d - STRAIGHT));
      heading += curl * STEP * (1 - fly);
      y += Math.cos(heading) * STEP;
      z -= Math.sin(heading) * STEP;
      pathY[i] = y;
      pathZ[i] = z;
    }

    // 평면의 맨 윗줄이 영수증 머리(먼저 나온 쪽)다.
    const mesh = paper.current;
    if (!mesh) return;
    const position = mesh.geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      const row = Math.floor(index / 2);
      const d = fed - (row / segments) * length;
      let py: number;
      let pz: number;
      if (d <= 0) {
        // 아직 프린터 안에 있는 부분은 몸체 속에 접어 둔다.
        py = Math.max(d, -0.3);
        pz = 0;
      } else {
        const f = d / STEP;
        const i0 = Math.min(Math.floor(f), count - 1);
        const i1 = Math.min(i0 + 1, count - 1);
        py = lerp(pathY[i0], pathY[i1], f - i0);
        pz = lerp(pathZ[i0], pathZ[i1], f - i0);
      }
      position.setY(index, py + fly * 1.6);
      position.setZ(index, pz + fly * 2.4);
    }
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();

    for (const material of [front.current, back.current]) {
      if (material) material.opacity = 1 - flyRaw;
    }
    // 출력하는 동안 프린터가 살짝 떨리고 불이 깜빡인다.
    if (printer.current) {
      printer.current.position.x = printing ? Math.sin(t * 90) * 0.006 : 0;
    }
    if (led.current) {
      led.current.emissiveIntensity = printing ? 0.6 + 0.6 * Math.sin(t * 20) : 0.5;
    }

    if (flyRaw >= 1 && !clock.current.done) {
      clock.current.done = true;
      onDone();
    }
  });

  return (
    <>
      <ambientLight intensity={1.2} />
      <hemisphereLight args={["#ffffff", "#e8e4dc", 0.6]} />
      <directionalLight position={[3, 6, 6]} intensity={2} />

      <mesh ref={paper} geometry={geometry} frustumCulled={false}>
        <meshStandardMaterial
          ref={front}
          map={texture}
          transparent
          alphaTest={0.5}
          roughness={0.9}
          side={THREE.FrontSide}
        />
      </mesh>
      {/* 뒷면은 글자가 비치지 않는 빈 종이. */}
      <mesh geometry={geometry} frustumCulled={false}>
        <meshStandardMaterial
          ref={back}
          map={texture}
          color="#f2efe8"
          transparent
          alphaTest={0.5}
          roughness={0.9}
          side={THREE.BackSide}
          onBeforeCompile={(shader) => {
            // 뒷면에서는 글자 대신 종이 색만 쓰고 톱니 모양(투명도)은 그대로 살린다.
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <map_fragment>",
              "#include <map_fragment>\ndiffuseColor.rgb = diffuse;"
            );
          }}
        />
      </mesh>

      <group ref={printer}>
        <RoundedBox
          args={[PAPER_WIDTH + 0.8, 0.8, 1.6]}
          radius={0.14}
          position={[0, -0.41, 0.3]}
        >
          <meshStandardMaterial color="#3a3a3d" roughness={0.5} />
        </RoundedBox>
        <mesh position={[0, 0.0, 0]}>
          <boxGeometry args={[PAPER_WIDTH + 0.12, 0.014, 0.06]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
        <mesh position={[0, 0.0, 0.45]}>
          <boxGeometry args={[PAPER_WIDTH + 0.4, 0.004, 0.012]} />
          <meshStandardMaterial color="#2a2a2c" />
        </mesh>
        <mesh position={[PAPER_WIDTH / 2, -0.22, 1.105]}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshStandardMaterial
            ref={led}
            color="#5bd27a"
            emissive="#5bd27a"
            emissiveIntensity={0.5}
          />
        </mesh>
      </group>

      <CameraRig />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        target={TARGET}
        minDistance={4}
        maxDistance={14}
      />
    </>
  );
};

/** 영수증이 다 섰을 때(약 3.6 높이)까지 화면에 들어오게 카메라를 둔다. */
const CameraRig = () => {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  useLayoutEffect(() => {
    const distance = fitDistance(2.2, 2.6, FOV, size.width / size.height);
    placeOnSphere(camera.position, TARGET, distance, 1.22, 0.42);
    camera.lookAt(TARGET);
  }, [camera, size]);
  return null;
};

/** 감열지 프린터에서 지난주 영수증이 출력되는 장면. */
export default function ReceiptPrinter(props: Props) {
  return (
    <div
      className="h-[420px] w-full overflow-hidden rounded-lg"
      data-testid="receipt-printer"
    >
      <Canvas flat dpr={[1, 2]} camera={{ fov: FOV, near: 0.1, far: 100 }}>
        <PrinterScene {...props} />
      </Canvas>
    </div>
  );
}
