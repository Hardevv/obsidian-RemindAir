import { PLUGIN_NAME } from "consts";
import flatpickr from "flatpickr";
import { App, Modal } from "obsidian";

export class DateTimePicker extends Modal {
  onSubmit: (date: string) => void;
  _selectedDate: string | null = null;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  initialDate: string | null;

  constructor(app: App, onSubmit: (date: string) => void, initialDate: string | null = null) {
    super(app);
    this.onSubmit = onSubmit;
    this.initialDate = initialDate;
    this.modalEl.addClass(`${PLUGIN_NAME}-date-time-picker-modal`);
    this.titleEl.textContent = "Select reminder date & time";
  }

  onOpen(): void {
    const { contentEl } = this;
    const input = contentEl.createEl("input", { cls: `${PLUGIN_NAME}-date-time-input` });
    const parsedInitialDate = this.initialDate ? new Date(this.initialDate) : null;
    const defaultDateTime =
      parsedInitialDate && !Number.isNaN(parsedInitialDate.getTime()) ? parsedInitialDate : new Date(Date.now() + 15 * 60 * 1000); // current time + 15 minutes

    const fp = flatpickr(input, {
      enableTime: true,
      time_24hr: true,
      inline: true, // visible calendar
      defaultDate: defaultDateTime,
      dateFormat: "Y-m-d H:i",
      allowInput: true,
    }) as flatpickr.Instance;

    setTimeout(() => {
      const selectedDay = fp.calendarContainer.querySelector<HTMLElement>(".flatpickr-day.selected, .flatpickr-day.today");
      if (!selectedDay) return;
      // prevent tabbing -1, and focus, so user can use arrows to change date
      selectedDay.tabIndex = -1;
      selectedDay.focus();
      return;
    }, 0);

    const submitSelectedDate = () => {
      const date = fp.selectedDates[0] ?? defaultDateTime;
      this.onSubmit(toLocalDateTimeValue(date));
      this.close();
    };

    const minuteInput = fp.calendarContainer.querySelector<HTMLInputElement>(".flatpickr-time .flatpickr-minute");
    const hourInput = fp.calendarContainer.querySelector<HTMLInputElement>(".flatpickr-time .flatpickr-hour");
    hourInput?.addEventListener("keydown", (evt: KeyboardEvent) => {
      if (evt.key !== "Enter") return;
      evt.preventDefault();
      minuteInput?.focus();
    });

    minuteInput?.addEventListener("keydown", (evt: KeyboardEvent) => {
      if (evt.key !== "Enter") return;
      evt.preventDefault();
      submitSelectedDate();
    });

    const btn = contentEl.createEl("button", { text: "Confirm", cls: `${PLUGIN_NAME}-datetime-picker-confirm-button` });
    btn.addEventListener("click", () => {
      submitSelectedDate();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

const toLocalDateTimeValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
};
