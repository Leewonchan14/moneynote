import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 상위 폴더의 다른 lockfile을 프로젝트 루트로 착각하지 않게 고정한다.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  allowedDevOrigins: ["127.0.0.1", "150.230.2.124"],
  // PGlite는 WASM과 데이터 파일을 직접 읽으므로 번들하지 않는다.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
