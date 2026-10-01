import { describe, expect, it } from 'vitest'
import { previewSchedule, scenarioPayload, validCustomDays } from '../lib/imports/model'

const now = new Date('2026-10-01T16:00:00.000Z') // 18:00 in Paris

describe('confirmation-based reminder scheduling', () => {
  it('starts an overdue gentle schedule from confirmation, not the historic due date', () => {
    const events = previewSchedule('2026-08-10','gentle',now)
    expect(events.map(e=>e.stage)).toEqual(['J+1','J+7','J+15'])
    expect(Date.parse(events[0].at)).toBe(now.getTime()+86400000)
    expect(events.every((e,i)=>i===0||Date.parse(e.at)-Date.parse(events[i-1].at)>=86400000)).toBe(true)
  })
  it('preserves spacing on overdue complete schedules', () => {
    const e=previewSchedule('2026-08-10','complete',now)
    expect(e.map(x=>x.stage)).toEqual(['J+1','J+4','J+10','J+18','J+33'])
  })
  it('uses invoice due date if it has not passed', () => {
    const e=previewSchedule('2026-10-25','complete',now)
    expect(e.map(x=>x.stage)).toEqual(['J-3','J+1','J+7','J+15','J+30'])
    expect(e[0].at).toBe('2026-10-22T09:00:00.000Z')
  })
  it('supports custom intervals relative to either confirmation or a future due date', () => {
    expect(validCustomDays([1,4,10])).toBe(true)
    expect(scenarioPayload('custom',[1,4,10])).toBe('custom:1,4,10')
    const overdue=previewSchedule('2026-08-10','custom',now,[2,5,10])
    expect(overdue.map(x=>x.stage)).toEqual(['J+2','J+5','J+10'])
    expect(overdue[0].at).toBe('2026-10-03T09:00:00.000Z')
    const future=previewSchedule('2026-10-25','custom',now,[2,5])
    expect(future[0].at).toBe('2026-10-27T09:00:00.000Z')
  })
  it.each([[1,1],[1,0],[0,5],[61],[3,2],[1,2,3,4,5,6],[],[2.5],[NaN]])('rejects invalid custom steps: %s',(...steps) => {
    expect(validCustomDays(steps)).toBe(false)
    expect(()=>scenarioPayload('custom',steps)).toThrow()
  })
})
