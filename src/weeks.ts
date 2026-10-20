/**
 * Weeks since the first check-in — the one number `week_active` carries
 * (analytics.ts), worked out here so it can be tested without a phone.
 *
 * Why a week number and not an install id (POSITIONING, 18 Oct 2026): an
 * id is a key, and every event one phone ever sent would line up behind
 * it into a profile of that phone's use. Counting week_active{week: 4}
 * against first_checkin in the same cohort gives retention with nothing
 * that links any two events. The phone does the arithmetic; what travels
 * is a small integer.
 *
 * Calendar days, not 24-hour spans: both dates are the phone's local ISO
 * dates, read as UTC midnights so a daylight-saving night is still one
 * day. Days 0–6 are week 1, the week of the first check-in itself.
 */

/** the last week counted. 13 weeks is 91 days: one TestFlight build's
 *  ninety-day life, past every rung of the retention ladder (GROWTH §1,
 *  day ~30) and past Phase 2's week-4 question. After it the event
 *  STOPS rather than clamping — a "13" sent every week thereafter would
 *  be a liveness ping with a tenure attached. A longer range buys
 *  nothing a cohort table of ten people can read, and every extra value
 *  is one more way a week number and a timestamp narrow down when one
 *  phone started. */
export const WEEK_ACTIVE_LAST = 13;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayNumber(s: string): number | null {
  const m = typeof s === 'string' ? ISO.exec(s) : null;
  if (!m) return null;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

/** 1-based week of `todayIso` counted from `firstIso`; null when either
 *  date is unreadable or today is before the first day (a clock set
 *  back, a flight west over the date line) — never a week 0 or below. */
export function weekSince(firstIso: string, todayIso: string): number | null {
  const a = dayNumber(firstIso), b = dayNumber(todayIso);
  if (a == null || b == null || b < a) return null;
  return Math.floor((b - a) / 7) + 1;
}

/** the week to count now, or null. Only a week ABOVE the last one sent —
 *  above, not different, so a clock moved back never resends an earlier
 *  week — and never past WEEK_ACTIVE_LAST. A week with no check-in is
 *  never filled in afterwards: only the week a check-in happens in. */
export function weekToSend(firstIso: string, todayIso: string, lastSent: number): number | null {
  const w = weekSince(firstIso, todayIso);
  const last = typeof lastSent === 'number' && isFinite(lastSent) ? lastSent : 0;
  if (w == null || w > WEEK_ACTIVE_LAST || w <= last) return null;
  return w;
}
