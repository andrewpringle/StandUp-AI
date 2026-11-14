import { describe, expect, it } from 'vitest';
import { dailyProgress, durationLabel, localDateKey, recordStudyInterval } from '../../public/student-demo/study.js';

describe('15-minute daily study target', () => {
  it('uses a stable local calendar date', () => {
    expect(localDateKey(new Date(2026,0,2,12))).toBe('2026-01-02');
  });
  it('adds time across separate sessions on the same day', () => {
    const start=new Date(2026,10,14,12).getTime();
    let totals=recordStudyInterval({},start,start+300_000);
    totals=recordStudyInterval(totals,start+600_000,start+900_000);
    expect(dailyProgress(totals,new Date(start))).toMatchObject({seconds:600,remaining:300,complete:false});
  });
  it('splits a session at local midnight without carrying yesterday into today', () => {
    const start=new Date(2026,10,14,23,59,59).getTime();
    const totals=recordStudyInterval({},start,start+2000);
    expect(totals['2026-11-14']).toBe(1);
    expect(totals['2026-11-15']).toBe(1);
    expect(dailyProgress(totals,new Date(2026,10,15,12)).seconds).toBe(1);
  });
  it('starts a new daily target without erasing previous study history', () => {
    const totals={'2026-11-14':900};
    expect(dailyProgress(totals,new Date(2026,10,15))).toMatchObject({seconds:0,remaining:900,percent:0,complete:false});
    expect(totals['2026-11-14']).toBe(900);
  });
  it('marks the target complete and keeps extra time while capping the bar', () => {
    expect(dailyProgress({'2026-11-14':1000},new Date(2026,10,14))).toMatchObject({seconds:1000,remaining:0,percent:100,complete:true});
    expect(durationLabel(901.9)).toBe('15:01');
  });
  it('does not award time for a reversed or invalid interval', () => {
    expect(recordStudyInterval({},2000,1000)).toEqual({});
    expect(recordStudyInterval({},NaN,1000)).toEqual({});
  });
});
