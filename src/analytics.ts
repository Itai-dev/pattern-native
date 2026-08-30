/**
 * Usage counts — the only thing Pattern ever phones home.
 *
 * THE LINE, stated where the code can enforce it: analytics may record
 * that something HAPPENED, never what it SAID. "A check-in was completed
 * in nine seconds, context was added" contains no health information.
 * A pain score, a body area, a factor answer, a note, a hypothesis — none
 * of these may ever appear here, in any field, under any name. The old
 * position was "no data collected"; the new one, decided 24 Aug 2026, is
 * "nothing you told us about your body" — a line that is defensible in a
 * sentence and enforceable in a file.
 *
 * Two mechanical guards back the discipline:
 *   - event names come from a closed union, so a new event is a visible
 *     diff in this file rather than a string invented at a call site;
 *   - property values are numbers, booleans, or strings capped hard at 24
 *     characters — long enough for 'evening' or 'sameAreas', too short
 *     for anything a person wrote about themselves.
 *
 * The user can turn it off in Profile. The identifier is a random id
 * minted on this device, linked to nothing. Events go to Aptabase
 * (EU-hosted, open source), named in the privacy policy; until an app key
 * was configured (24 Aug 2026), every call was a no-op; the ingestion
 * shape was verified against the live endpoint before the first ship.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as db from './db';

/* set when the Aptabase app is created; empty = analytics entirely off */
const APP_KEY = 'A-EU-5124485143';
const INGEST_URL = 'https://eu.aptabase.com/api/v0/event';

/** every event Pattern may ever count — a closed list, on purpose */
export type EventName =
  | 'app_open'
  | 'day_active'
  | 'onboarding_completed'
  | 'first_checkin'
  | 'checkin_completed'
  | 'checkin_abandoned'
  | 'focus_started'
  | 'focus_changed'
  | 'focus_extended'
  | 'event_logged'
  | 'reminder_enabled'
  | 'reminder_disabled'
  | 'trends_opened'
  /* Kept in the list, no longer sent: History stopped being a tab when
     the calendar moved into the record. An id is never reused for a
     different meaning, and an id already in the field is never deleted —
     older builds still send this one. */
  | 'history_opened'
  /* a day was opened, from Today or from the calendar. That it was
     opened, never which day and never what was on it. */
  | 'day_opened'
  /* Apple Health: the setup was opened, completed, or undone. A category
     COUNT may travel; which categories, what was granted inside Apple's
     sheet, and any sample ever read may not — a HealthKit value is
     health data and the closed-list rule covers it like everything else. */
  | 'health_setup_opened'
  | 'health_connected'
  | 'health_disconnected'
  | 'pdf_shared'
  | 'backup_exported'
  | 'backup_restored'
  | 'widget_tap';

type PropValue = number | boolean | string;

const PREF_ENABLED = 'analytics.enabled';
const PREF_LASTDAY = 'analytics.lastDay';
const PREF_FIRSTSENT = 'analytics.firstCheckinSent';

export function analyticsEnabled(): boolean {
  return db.getPref<boolean>(PREF_ENABLED, true);
}
export function setAnalyticsEnabled(on: boolean): void {
  db.setPref(PREF_ENABLED, on);
}

/* one session id per cold start — no meaning beyond "same sitting" */
const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

/** the hard cap that keeps a sentence from ever travelling as a "prop" */
function clamp(v: PropValue): PropValue {
  if (typeof v === 'string') return v.slice(0, 24);
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  return v;
}

/**
 * Count one event. Fire-and-forget by design: analytics must never slow
 * a check-in, block a save, or surface an error to someone logging pain.
 */
export function track(name: EventName, props?: Record<string, PropValue>): void {
  if (!APP_KEY || !analyticsEnabled()) return;
  const clean: Record<string, PropValue> = {};
  if (props) for (const k of Object.keys(props)) clean[k.slice(0, 24)] = clamp(props[k]);
  fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'App-Key': APP_KEY },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      sessionId,
      eventName: name,
      systemProps: {
        isDebug: __DEV__,
        locale: 'en',
        osName: Platform.OS === 'ios' ? 'iOS' : 'Android',
        osVersion: String(Platform.Version),
        appVersion: Constants.expoConfig?.version || '?',
        sdkVersion: 'pattern-inline',
      },
      props: clean,
    }),
  }).catch(() => { /* a dropped count is a dropped count */ });
}

/** app_open every cold start; day_active once per local date */
export function trackLaunch(todayIso: string): void {
  track('app_open');
  if (db.getPref<string>(PREF_LASTDAY, '') !== todayIso) {
    db.setPref(PREF_LASTDAY, todayIso);
    track('day_active');
  }
}

/** checkin_completed, and first_checkin exactly once per install */
export function trackCheckin(seconds: number, contextAdded: boolean): void {
  track('checkin_completed', { seconds, context: contextAdded });
  if (!db.getPref<boolean>(PREF_FIRSTSENT, false)) {
    db.setPref(PREF_FIRSTSENT, true);
    track('first_checkin');
  }
}
