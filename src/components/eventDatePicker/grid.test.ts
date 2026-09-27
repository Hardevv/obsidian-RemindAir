import { describe, expect, it } from "vitest"
import {
  MINUTES_IN_DAY,
  addMinutes,
  atMinutes,
  clampMinutes,
  dayColumns,
  dayKey,
  dayOverlap,
  daysHeaderLabel,
  durationLabel,
  durationMinutes,
  formatHourLabel,
  formatTime,
  isSameDay,
  minutesAtPointer,
  minutesFromMidnight,
  monthCells,
  moveToDay,
  rangeLabel,
  scrollOffsetFor,
  snapDown,
  snapUp,
  startOfDay,
} from "./grid"

describe("monthCells", () => {
  it("starts on monday and covers only the weeks the month spans", () => {
    const cells = monthCells(new Date(2026, 9, 15), 1)

    expect(cells).toHaveLength(35)
    expect(dayKey(cells[0].date)).toBe("2026-09-28")
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31)
  })

  it("adds a sixth week when the month needs it", () => {
    const cells = monthCells(new Date(2027, 4, 10), 1)

    expect(cells).toHaveLength(42)
    expect(dayKey(cells[0].date)).toBe("2027-04-26")
    expect(dayKey(cells[cells.length - 1].date)).toBe("2027-06-06")
  })

  it("uses four weeks for a february that starts on the first weekday", () => {
    const cells = monthCells(new Date(2027, 1, 10), 1)

    expect(cells).toHaveLength(28)
    expect(dayKey(cells[0].date)).toBe("2027-02-01")
    expect(cells.every((cell) => cell.inMonth)).toBe(true)
  })

  it("starts on sunday when the week starts there", () => {
    const cells = monthCells(new Date(2026, 9, 15), 0)

    expect(dayKey(cells[0].date)).toBe("2026-09-27")
  })
})

describe("dayColumns", () => {
  it("returns the whole week for the wide layout", () => {
    const days = dayColumns(new Date(2026, 9, 28, 10, 7), 7, 1)

    expect(days.map(dayKey)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"])
  })

  it("starts at the anchor for the narrow layout", () => {
    const days = dayColumns(new Date(2026, 9, 28, 10, 7), 3, 1)

    expect(days.map(dayKey)).toEqual(["2026-10-28", "2026-10-29", "2026-10-30"])
  })
})

describe("snapping", () => {
  it("snaps down and up to the quarter hour", () => {
    expect(snapDown(607)).toBe(600)
    expect(snapUp(607)).toBe(615)
  })

  it("keeps the value inside the day", () => {
    expect(clampMinutes(-30)).toBe(0)
    expect(clampMinutes(MINUTES_IN_DAY + 30)).toBe(MINUTES_IN_DAY - 15)
  })
})

describe("minutesAtPointer", () => {
  it("maps the column height to a full day", () => {
    expect(minutesAtPointer(600, 0)).toBe(600)
    expect(minutesAtPointer(1440, 0)).toBe(1440)
    expect(minutesAtPointer(300, 60)).toBe(240)
  })
})

describe("dates", () => {
  it("builds a date at a given minute of the day", () => {
    const date = atMinutes(new Date(2026, 9, 28), 615)

    expect(formatTime(date, true)).toBe("10:15")
    expect(date.getSeconds()).toBe(0)
  })

  it("moves the time of day onto another day", () => {
    const moved = moveToDay(new Date(2026, 9, 28, 10, 15), new Date(2026, 10, 2))

    expect(dayKey(moved)).toBe("2026-11-02")
    expect(formatTime(moved, true)).toBe("10:15")
  })

  it("reads minutes from midnight", () => {
    expect(minutesFromMidnight(new Date(2026, 9, 28, 10, 15))).toBe(615)
  })

  it("adds minutes across midnight", () => {
    expect(dayKey(addMinutes(new Date(2026, 9, 28, 23, 50), 30))).toBe("2026-10-29")
  })

  it("compares days", () => {
    expect(isSameDay(new Date(2026, 9, 28, 1), new Date(2026, 9, 28, 23))).toBe(true)
    expect(isSameDay(new Date(2026, 9, 28), new Date(2026, 9, 29))).toBe(false)
  })

  it("normalizes the start of the day", () => {
    expect(formatTime(startOfDay(new Date(2026, 9, 28, 23, 59)), true)).toBe("00:00")
  })
})

describe("dayOverlap", () => {
  it("clips the selection to the day", () => {
    const overlap = dayOverlap(new Date(2026, 9, 28, 22, 0), new Date(2026, 9, 29, 2, 0), new Date(2026, 9, 28))

    expect(overlap).toEqual({ start: 1320, end: 1440 })
  })

  it("returns null for a day outside the range", () => {
    expect(dayOverlap(new Date(2026, 9, 28, 10), new Date(2026, 9, 28, 11), new Date(2026, 9, 30))).toBeNull()
  })
})

describe("labels", () => {
  it("formats time in both formats", () => {
    const date = new Date(2026, 9, 28, 14, 30)

    expect(formatTime(date, true)).toBe("14:30")
    expect(formatTime(date, false)).toBe("2:30 PM")
  })

  it("formats midnight and noon in the twelve hour clock", () => {
    expect(formatTime(new Date(2026, 9, 28, 0, 5), false)).toBe("12:05 AM")
    expect(formatTime(new Date(2026, 9, 28, 12, 5), false)).toBe("12:05 PM")
  })

  it("formats hour labels", () => {
    expect(formatHourLabel(0, true)).toBe("00:00")
    expect(formatHourLabel(13, true)).toBe("13:00")
    expect(formatHourLabel(13, false)).toBe("1 PM")
  })

  it("describes the duration", () => {
    expect(durationMinutes(new Date(2026, 9, 28, 10), new Date(2026, 9, 28, 11, 30))).toBe(90)
    expect(durationLabel(90)).toBe("1 h 30 min")
    expect(durationLabel(60)).toBe("1 h")
    expect(durationLabel(15)).toBe("15 min")
  })

  it("describes the range", () => {
    expect(rangeLabel(new Date(2026, 9, 28, 10), new Date(2026, 9, 28, 10, 15), true)).toContain("10:00 → 10:15")
    expect(rangeLabel(new Date(2026, 9, 28, 23), new Date(2026, 9, 29, 1), true)).toContain("23:00 →")
  })

  it("describes a range of days", () => {
    const label = daysHeaderLabel(dayColumns(new Date(2026, 9, 28), 7, 1))

    expect(label).toContain("26 - 1")
  })

  it("scrolls an hour above the given time", () => {
    expect(scrollOffsetFor(new Date(2026, 9, 28, 10, 15))).toBe(540)
    expect(scrollOffsetFor(new Date(2026, 9, 28, 0, 30))).toBe(0)
  })
})
