/**
 * The mock health service — tests and previews, no store required.
 *
 * It implements the same HealthService interface the real adapter does,
 * from a plain fixture: a map of date → raw bundle fragments. What it
 * does NOT mock is authorization outcomes, because the real store does
 * not reveal them either — `requestAuthorization` resolves and that is
 * all anyone learns, which keeps a test honest about the one thing
 * HealthKit refuses to say.
 */
import {
  DayRawBundle, HealthCategory, HealthService,
} from './types';

export type MockFixture = Record<string, Partial<Omit<DayRawBundle, 'date'>>>;

export function emptyBundle(date: string): DayRawBundle {
  return {
    date, sleep: [], steps: [], distance: [], activeEnergy: [],
    workouts: [], restingHeartRate: [], hrvSDNN: [], stateOfMind: [],
  };
}

export class MockHealthService implements HealthService {
  requested: HealthCategory[][] = [];
  constructor(private fixture: MockFixture, private isAvailable = true) {}

  available(): boolean { return this.isAvailable; }

  requestAuthorization(categories: HealthCategory[]): Promise<void> {
    this.requested.push(categories.slice());
    return Promise.resolve();
  }

  fetchDay(date: string, categories: HealthCategory[]): Promise<DayRawBundle> {
    const out = emptyBundle(date);
    const f = this.fixture[date];
    if (!f) return Promise.resolve(out);
    /* only the asked-for categories come back — the mock respects the
       request the way the store respects the grant */
    if (categories.indexOf('sleep') >= 0 && f.sleep) out.sleep = f.sleep;
    if (categories.indexOf('movement') >= 0) {
      if (f.steps) out.steps = f.steps;
      if (f.distance) out.distance = f.distance;
      if (f.activeEnergy) out.activeEnergy = f.activeEnergy;
    }
    if (categories.indexOf('workouts') >= 0 && f.workouts) out.workouts = f.workouts;
    if (categories.indexOf('heart') >= 0) {
      if (f.restingHeartRate) out.restingHeartRate = f.restingHeartRate;
      if (f.hrvSDNN) out.hrvSDNN = f.hrvSDNN;
    }
    if (categories.indexOf('mind') >= 0 && f.stateOfMind) out.stateOfMind = f.stateOfMind;
    return Promise.resolve(out);
  }
}

/** the service every non-iOS platform and every pre-HealthKit binary
 *  gets: present, callable, and empty. Nothing downstream needs a
 *  null-check — unavailability is just a service with nothing in it. */
export class UnavailableHealthService implements HealthService {
  available(): boolean { return false; }
  requestAuthorization(): Promise<void> {
    return Promise.reject(new Error('HealthKit is not available on this device'));
  }
  fetchDay(date: string): Promise<DayRawBundle> {
    return Promise.resolve(emptyBundle(date));
  }
}
