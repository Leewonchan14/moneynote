import _dayjs from "dayjs";
import "dayjs/locale/ko.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

_dayjs.locale("ko");
_dayjs.extend(utc);
_dayjs.extend(timezone);
_dayjs.extend(relativeTime);

const TZ = "Asia/Seoul";

/**
 * dayjs wrapper that returns objects in Asia/Seoul timezone.
 *
 * - `kst()` — current time in KST
 * - `kst("2026-04-11")` — date-only string → midnight KST
 * - `kst(isoString | Date | number)` — converted to KST
 *
 * Drop-in replacement for `import dayjs from "dayjs"` where KST is desired.
 */
/** dayjs with UTC + timezone plugins loaded (static methods available) */
export const dayjs = _dayjs;

export function kst(init?: _dayjs.ConfigType): _dayjs.Dayjs {
  if (init == null) return _dayjs().tz(TZ);
  // Date-only string → treat as midnight KST, not UTC
  if (typeof init === "string" && /^\d{4}-\d{2}-\d{2}$/.test(init)) {
    return _dayjs.utc(init).tz(TZ);
  }
  return _dayjs(init).tz(TZ);
}
