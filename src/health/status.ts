import { HEALTH_CATEGORIES, HealthCategory, HealthDay } from './types';

/** Bookkeeping lives beside the imported cache, so disconnect, restore
 *  and cache deletion cannot leave a success timestamp over an empty cache. */
export interface HealthSyncStatus {
  lastAttempt: string;
  lastSuccess: string | null;
  outcome: 'complete' | 'partial';
}

function readings(day: HealthDay, category: HealthCategory): string[] {
  const present = (items: [string, unknown][]) => items.filter(([, v]) => v != null).map(([label]) => label);
  switch (category) {
    case 'sleep': return day.sleepMinutes == null ? [] : [day.sleepKind === 'inBed' ? 'Time in bed' : 'Time asleep'];
    case 'movement': return present([['Steps', day.steps], ['Distance', day.distanceMeters],
      ['Active energy', day.activeEnergyKcal], ['Standing time', day.standMinutes]]);
    // A covered day with no workouts is not an imported workout record.
    case 'workouts': return day.workouts?.length ? ['Workout records'] : [];
    case 'medications': return day.doses?.length ? ['Logged doses, including recorded skips'] : [];
    case 'mind': return day.stateOfMind?.length ? ['State of Mind entries'] : [];
    case 'heart': return present([['Resting heart rate', day.restingHeartRate], ['Heart-rate variability', day.hrvSDNN]]);
    case 'nutrition': return present([['Water', day.waterMl], ['Caffeine', day.caffeineMg], ['Alcohol', day.alcoholDrinks]]);
  }
}

/** Availability is based on actual cached fields, never a permission
 *  inference. In particular, measured zero is still a received reading. */
export function connectedDataRows(health: Record<string, HealthDay>, categories: HealthCategory[], today: string) {
  const days = Object.keys(health).filter(d => d <= today).sort().reverse();
  return HEALTH_CATEGORIES.filter(c => categories.includes(c.id)).map(c => {
    const latest = days.find(d => readings(health[d], c.id).length > 0);
    return { id: c.id, name: c.name, latest: latest || null,
      readings: latest ? readings(health[latest], c.id) : [] };
  });
}
