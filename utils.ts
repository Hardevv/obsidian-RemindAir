export const getDateObjectFromReminderString = (reminderString: string): Date | null => {
  try {
    return new Date(reminderString);
  } catch {
    return null;
  }
};
