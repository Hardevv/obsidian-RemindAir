import { ID_LETTERS } from "consts";

export const getDateObjectFromReminderString = (reminderString: string): Date | null => {
  try {
    return new Date(reminderString);
  } catch {
    return null;
  }
};

/** if `shallow` passed  it only checks the date */
export const isDateEqual = (date1: string | Date, date2: string | Date, shallow?: boolean): boolean => {
  const d1 = typeof date1 === "string" ? new Date(date1) : date1;
  const d2 = typeof date2 === "string" ? new Date(date2) : date2;

  if (shallow) return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  return d1.getTime() === d2.getTime();
};

export const getRandomIdSuffix = () => ID_LETTERS[Math.floor(Math.random() * ID_LETTERS.length)];
