/**
 * A minute-of-day as the phone writes the time.
 *
 * model.ts's fmtTime is deliberately fixed at "14:20": it is the form
 * the record, the tests and the clinician PDF share, and it must never
 * depend on which phone rendered it. This is the OTHER form — the one
 * a person reads on a screen, in the convention their iPhone is set
 * to. "2:20 PM" on a US phone, "14:20" almost everywhere else, decided
 * by the system and not by us. Every screen uses this; the record and
 * the PDF keep fmtTime.
 *
 * Intl is asked once and kept. It cannot fail on a shipping iPhone, but
 * a fallback to the 24-hour form is cheaper than a screen with no time
 * on it if it ever does.
 */
import { fmtTime } from './model';

let formatter: Intl.DateTimeFormat | null = null;

export function fmtClock(h: number): string {
  try {
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    const m = Math.max(0, Math.min(1439, Math.round(h)));
    const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
    /* narrow and non-breaking spaces before AM/PM become plain ones —
       they wrap and measure oddly in RN text */
    return formatter.format(d).replace(/[  ]/g, ' ');
  } catch {
    return fmtTime(h);
  }
}
