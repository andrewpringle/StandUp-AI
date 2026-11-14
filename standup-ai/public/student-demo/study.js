export const DAILY_TARGET_SECONDS = 15 * 60;

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

// Split an active interval at local midnight so yesterday's work stays yesterday.
export function recordStudyInterval(totals, startMs, endMs) {
  const result = { ...totals };
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return result;
  let cursor = startMs;
  while (cursor < endMs) {
    const date = new Date(cursor);
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()+1).getTime();
    const end = Math.min(endMs, midnight);
    const day = localDateKey(date);
    result[day] = (Number(result[day]) || 0) + (end-cursor)/1000;
    cursor = end;
  }
  return result;
}

export function dailyProgress(totals, date = new Date()) {
  const seconds = Math.max(0, Math.floor(Number(totals[localDateKey(date)]) || 0));
  return { seconds, target:DAILY_TARGET_SECONDS, remaining:Math.max(0,DAILY_TARGET_SECONDS-seconds), percent:Math.min(100,seconds/DAILY_TARGET_SECONDS*100), complete:seconds>=DAILY_TARGET_SECONDS };
}

export function durationLabel(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
}
