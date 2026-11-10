import { createToken, verifyToken } from "@/lib/auth";
import {
  clearLoginFailures,
  pruneLoginAttempts,
  reserveLoginAttempt,
} from "@/lib/db/auth-attempts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const token = req.headers.get("x-auth-token");
  if (!token) {
    return Response.json({ valid: false }, { status: 401 });
  }

  try {
    const valid = await verifyToken(token);
    if (!valid) {
      return Response.json({ valid: false }, { status: 401 });
    }
    return Response.json({ valid: true });
  } catch {
    return Response.json({ valid: false }, { status: 401 });
  }
};

/** Vercel과 앞단 프록시가 채워 주는 접속 IP. 없으면 전체 한도만 적용되는 값으로 묶인다. */
const getClientIp = (req: Request): string =>
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export const POST = async (req: Request) => {
  let password: unknown;
  try {
    ({ password } = await req.json());
  } catch {
    return Response.json(
      { success: false, error: "요청을 처리할 수 없습니다." },
      { status: 400 }
    );
  }

  const expectedPassword = process.env.SITE_PASSWORD;
  if (!expectedPassword) {
    console.error("SITE_PASSWORD environment variable not set");
    return Response.json(
      { success: false, error: "서버 설정 오류가 발생했습니다." },
      { status: 500 }
    );
  }

  try {
    const ip = getClientIp(req);
    const attempt = await reserveLoginAttempt(ip);

    // 차단 중에는 비밀번호를 비교하지 않아 정답 여부가 드러나지 않는다.
    if (attempt.status === "blocked") {
      const minutes = Math.ceil(attempt.retryAfterSeconds / 60);
      return Response.json(
        {
          success: false,
          error: `로그인 시도가 너무 많아요. ${minutes}분 뒤에 다시 시도해 주세요.`,
        },
        { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } }
      );
    }

    if (password === expectedPassword) {
      await clearLoginFailures(ip);
      const token = await createToken(expectedPassword);
      return Response.json({ success: true, token });
    }

    await pruneLoginAttempts().catch((error) => console.error(error));
    return Response.json({ success: false, error: "비밀번호가 틀렸습니다." });
  } catch (error) {
    // 제한을 확인할 수 없으면 통과시키지 않는다.
    console.error("[auth] login limit check failed:", error);
    return Response.json(
      { success: false, error: "잠시 후 다시 시도해 주세요." },
      { status: 503 }
    );
  }
};
