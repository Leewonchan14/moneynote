export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_IP_LIMIT = 5;
export const LOGIN_GLOBAL_LIMIT = 30;

export interface LoginFailure {
  ip: string;
  at: number;
}

/** 창 안에서 limit번째 실패가 나온 시각부터 창 길이만큼 차단한다. */
const getBlockedUntil = (sortedTimes: number[], limit: number): number => {
  let blockedUntil = 0;
  for (let index = limit - 1; index < sortedTimes.length; index += 1) {
    const first = sortedTimes[index - limit + 1];
    const last = sortedTimes[index];
    if (last - first < LOGIN_WINDOW_MS) {
      blockedUntil = Math.max(blockedUntil, last + LOGIN_WINDOW_MS);
    }
  }
  return blockedUntil;
};

/** 차단 중이면 남은 초를, 아니면 0을 돌려준다. */
export const getLoginBlockSeconds = (
  failures: LoginFailure[],
  ip: string,
  now: number
): number => {
  const all = failures.map((failure) => failure.at).sort((a, b) => a - b);
  const fromIp = failures
    .filter((failure) => failure.ip === ip)
    .map((failure) => failure.at)
    .sort((a, b) => a - b);

  const blockedUntil = Math.max(
    getBlockedUntil(fromIp, LOGIN_IP_LIMIT),
    getBlockedUntil(all, LOGIN_GLOBAL_LIMIT)
  );
  return blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0;
};

/** 동시에 들어온 요청 때문에 한도를 넘었는지 확인한다. */
export const exceedsLoginLimit = (
  failures: LoginFailure[],
  ip: string,
  now: number
): boolean => {
  const recent = failures.filter((failure) => now - failure.at < LOGIN_WINDOW_MS);
  return (
    recent.length > LOGIN_GLOBAL_LIMIT ||
    recent.filter((failure) => failure.ip === ip).length > LOGIN_IP_LIMIT
  );
};
