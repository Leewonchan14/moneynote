import { eq, gt, lt } from "drizzle-orm";

import {
  exceedsLoginLimit,
  getLoginBlockSeconds,
  LOGIN_WINDOW_MS,
  type LoginFailure,
} from "@/lib/auth-rate-limit";
import { getDb, schema } from "@/lib/db/db";

const RETENTION_MS = 24 * 60 * 60 * 1000;
const OVER_LIMIT_RETRY_SECONDS = 60;

const readRecentFailures = async (now: number): Promise<LoginFailure[]> => {
  const rows = await getDb()
    .select({
      ip: schema.authLoginAttempts.ip,
      createdAt: schema.authLoginAttempts.createdAt,
    })
    .from(schema.authLoginAttempts)
    .where(gt(schema.authLoginAttempts.createdAt, new Date(now - 2 * LOGIN_WINDOW_MS)));
  return rows.map((row) => ({ ip: row.ip, at: row.createdAt.getTime() }));
};

export type LoginAttemptResult =
  { status: "allowed"; id: number } | { status: "blocked"; retryAfterSeconds: number };

/**
 * 비밀번호를 비교하기 전에 시도를 먼저 기록한다.
 * 동시에 쏟아지는 요청도 한도를 넘지 못하게 하고, 차단된 요청은 기록하지 않는다.
 */
export const reserveLoginAttempt = async (ip: string): Promise<LoginAttemptResult> => {
  const db = getDb();
  const now = Date.now();

  const retryAfterSeconds = getLoginBlockSeconds(await readRecentFailures(now), ip, now);
  if (retryAfterSeconds > 0) return { status: "blocked", retryAfterSeconds };

  const [attempt] = await db.insert(schema.authLoginAttempts).values({ ip }).returning();

  const checkedAt = Date.now();
  const failures = await readRecentFailures(checkedAt);
  if (exceedsLoginLimit(failures, ip, checkedAt)) {
    await db
      .delete(schema.authLoginAttempts)
      .where(eq(schema.authLoginAttempts.id, attempt.id));
    return {
      status: "blocked",
      retryAfterSeconds:
        getLoginBlockSeconds(failures, ip, checkedAt) || OVER_LIMIT_RETRY_SECONDS,
    };
  }

  return { status: "allowed", id: attempt.id };
};

/** 로그인에 성공하면 그 IP의 실패 기록을 지운다. */
export const clearLoginFailures = async (ip: string): Promise<void> => {
  await getDb()
    .delete(schema.authLoginAttempts)
    .where(eq(schema.authLoginAttempts.ip, ip));
};

export const pruneLoginAttempts = async (): Promise<void> => {
  await getDb()
    .delete(schema.authLoginAttempts)
    .where(lt(schema.authLoginAttempts.createdAt, new Date(Date.now() - RETENTION_MS)));
};
