import { describe, expect, it } from "vitest";
import { getDateObjectFromReminderString, isDateEqual, toLocalDateTimeValue } from "src/utils/dates";

describe("getDateObjectFromReminderString", () => {
  it("parses a local date time string", () => {
    const date = getDateObjectFromReminderString("2026-11-02T10:30");

    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(10);
    expect(date?.getDate()).toBe(2);
    expect(date?.getHours()).toBe(10);
    expect(date?.getMinutes()).toBe(30);
  });

  it("returns null for an unparsable string", () => {
    expect(getDateObjectFromReminderString("not a date")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(getDateObjectFromReminderString("")).toBeNull();
  });
});

describe("isDateEqual", () => {
  it("compares a string with a Date", () => {
    const date = new Date(2026, 10, 2, 10, 0);

    expect(isDateEqual("2026-11-02T10:00", date)).toBe(true);
    expect(isDateEqual("2026-11-02T10:01", date)).toBe(false);
  });

  it("compares two Dates", () => {
    const date = new Date(2026, 10, 2, 10, 0);

    expect(isDateEqual(date, new Date(date))).toBe(true);
    expect(isDateEqual(date, new Date(2026, 10, 2, 10, 0, 1))).toBe(false);
  });

  it("ignores the time when shallow", () => {
    const date = new Date(2026, 10, 2, 10, 0);

    expect(isDateEqual("2026-11-02T23:59", date, true)).toBe(true);
  });

  it("compares the date when shallow", () => {
    const date = new Date(2026, 10, 2, 10, 0);

    expect(isDateEqual("2026-11-03T10:00", date, true)).toBe(false);
    expect(isDateEqual("2026-12-02T10:00", date, true)).toBe(false);
  });
});

describe("toLocalDateTimeValue", () => {
  it("formats a date as a local reminder value", () => {
    expect(toLocalDateTimeValue(new Date(2026, 10, 2, 10, 30))).toBe("2026-11-02T10:30");
  });

  it("pads single digit values", () => {
    expect(toLocalDateTimeValue(new Date(2026, 0, 5, 9, 7))).toBe("2026-01-05T09:07");
  });

  it("uses midnight and end of day correctly", () => {
    expect(toLocalDateTimeValue(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31T00:00");
    expect(toLocalDateTimeValue(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31T23:59");
  });
});
