export const SLOT_MINUTES = 15
export const HOUR_HEIGHT = 60
export const HOURS_IN_DAY = 24
export const MINUTES_IN_DAY = HOURS_IN_DAY * 60

const pad = (value: number): string => String(value).padStart(2, "0")

export const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate())

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)

  return next
}

export const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60000)

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const dayKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const minutesFromMidnight = (date: Date): number => date.getHours() * 60 + date.getMinutes()

export const atMinutes = (day: Date, minutes: number): Date => {
  const date = startOfDay(day)
  date.setMinutes(minutes)

  return date
}

export const moveToDay = (date: Date, day: Date): Date => atMinutes(day, minutesFromMidnight(date))

export const clampMinutes = (minutes: number): number => Math.min(Math.max(minutes, 0), MINUTES_IN_DAY - SLOT_MINUTES)

export const snapDown = (minutes: number, slot = SLOT_MINUTES): number => clampMinutes(Math.floor(minutes / slot) * slot)

export const snapUp = (minutes: number, slot = SLOT_MINUTES): number => clampMinutes(Math.ceil(minutes / slot) * slot)

/** Maps a pointer position inside a column to minutes from midnight. */
export const minutesAtPointer = (clientY: number, columnTop: number): number =>
  ((clientY - columnTop) / (HOUR_HEIGHT * HOURS_IN_DAY)) * MINUTES_IN_DAY

export const durationMinutes = (from: Date, to: Date): number => Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000))

export const durationLabel = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours && rest) return `${hours} h ${rest} min`
  if (hours) return `${hours} h`

  return `${rest} min`
}

export interface MonthCell {
  date: Date
  inMonth: boolean
}

/** Whole weeks, and only as many as the month actually spans. */
export const monthCells = (anchor: Date, weekStartsOn: 0 | 1): MonthCell[] => {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const offset = (first.getDay() - weekStartsOn + 7) % 7
  const start = addDays(first, -offset)
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const weeks = Math.ceil((offset + daysInMonth) / 7)

  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = addDays(start, index)

    return { date, inMonth: date.getMonth() === first.getMonth() }
  })
}

/** A full week for the wide layout, and a window starting at the anchor for the narrow one. */
export const dayColumns = (anchor: Date, count: number, weekStartsOn: 0 | 1): Date[] => {
  const day = startOfDay(anchor)
  const base = count >= 7 ? addDays(day, -((day.getDay() - weekStartsOn + 7) % 7)) : day

  return Array.from({ length: count }, (_, index) => addDays(base, index))
}

export const dayOverlap = (from: Date, to: Date, day: Date): { start: number; end: number } | null => {
  const dayStart = startOfDay(day).getTime()
  const start = Math.max(from.getTime(), dayStart)
  const end = Math.min(to.getTime(), dayStart + MINUTES_IN_DAY * 60000)
  if (end <= start) return null

  return { start: (start - dayStart) / 60000, end: (end - dayStart) / 60000 }
}

export const formatTime = (date: Date, time24: boolean): string => {
  const minutes = pad(date.getMinutes())
  if (time24) return `${pad(date.getHours())}:${minutes}`

  return `${date.getHours() % 12 || 12}:${minutes} ${date.getHours() < 12 ? "AM" : "PM"}`
}

export const formatHourLabel = (hour: number, time24: boolean): string => {
  if (time24) return `${pad(hour)}:00`

  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`
}

export const weekdayLabel = (date: Date): string => date.toLocaleDateString(undefined, { weekday: "short" })

export const monthLabel = (date: Date): string => date.toLocaleDateString(undefined, { month: "long", year: "numeric" })

export const rangeLabel = (from: Date, to: Date, time24: boolean): string => {
  const start = `${weekdayLabel(from)} ${from.getDate()} ${formatTime(from, time24)}`
  const end = isSameDay(from, to) ? formatTime(to, time24) : `${weekdayLabel(to)} ${to.getDate()} ${formatTime(to, time24)}`

  return `${start} → ${end}`
}

export const daysHeaderLabel = (days: Date[]): string => {
  const first = days[0]
  const last = days[days.length - 1]
  if (!last) return ""
  if (first.getMonth() === last.getMonth()) return `${first.getDate()} - ${last.getDate()} ${monthLabel(first)}`

  return `${first.getDate()} ${monthLabel(first)} - ${last.getDate()} ${monthLabel(last)}`
}

export interface MinuteRange {
  start: number
  end: number
}

/** Greedy lane assignment so overlapping events share the width of a day column. */
export const layoutRanges = (ranges: MinuteRange[]): { lane: number; lanes: number }[] => {
  const order = ranges.map((range, index) => ({ range, index })).sort((a, b) => a.range.start - b.range.start || a.range.end - b.range.end)
  const laneEnds: number[] = []
  const laneOf = new Array<number>(ranges.length).fill(0)

  for (const { range, index } of order) {
    let lane = laneEnds.findIndex((end) => end <= range.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(range.end)
    } else {
      laneEnds[lane] = range.end
    }
    laneOf[index] = lane
  }

  const lanes = Math.max(1, laneEnds.length)

  return laneOf.map((lane) => ({ lane, lanes }))
}

export const rangeKey = (start: Date, end: Date): string => `${dayKey(start)}:${dayKey(end)}`

export const parseDayKey = (key: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/** Keeps the day number when jumping months, so 31 January goes to 28 February. */
export const sameDayInMonth = (date: Date, year: number, month: number): Date => {
  const lastDay = new Date(year, month + 1, 0).getDate()

  return new Date(year, month, Math.min(date.getDate(), lastDay))
}

/** One hour of headroom above the given time, so the current hour is not glued to the top edge. */
export const scrollOffsetFor = (date: Date): number => Math.max(0, (date.getHours() - 1) * HOUR_HEIGHT)
