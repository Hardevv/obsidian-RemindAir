export const getDateObjectFromReminderString = (reminderString: string): Date | null => {
  const date = new Date(reminderString);
  return isNaN(date.getTime()) ? null : date;
};

/** if `shallow` passed  it only checks the date */
export const isDateEqual = (date1: string | Date, date2: string | Date, shallow?: boolean): boolean => {
  const d1 = typeof date1 === "string" ? new Date(date1) : date1;
  const d2 = typeof date2 === "string" ? new Date(date2) : date2;

  if (shallow) return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  return d1.getTime() === d2.getTime();
};

export const toLocalDateTimeValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
};
