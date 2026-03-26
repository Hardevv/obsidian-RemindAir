import { PLUGIN_NAME } from "consts";
import flatpickr from "flatpickr";
import { App, Modal } from "obsidian";
import { toLocalDateTimeValue } from "utils";

export class DateTimePicker extends Modal {
  onSubmit: (date: string) => void;
  _selectedDate: string | null = null;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  date: string | Date | null = null;
  private viewportCleanup: (() => void) | null = null;

  constructor(app: App, onSubmit: (date: string) => void, date: string | Date | null = null) {
    super(app);
    this.onSubmit = onSubmit;
    this.modalEl.addClass(`${PLUGIN_NAME}-date-time-picker-modal`);
    this.titleEl.textContent = "Select reminder date & time";
    this.date = date;
  }

  onOpen(): void {
    const { contentEl } = this;
    const input = contentEl.createEl("input", { cls: `${PLUGIN_NAME}-date-time-input` });
    const parsedInitialDate = this.date ? new Date(this.date) : new Date();
    const defaultDateTime =
      parsedInitialDate && !Number.isNaN(parsedInitialDate.getTime()) ? parsedInitialDate : new Date(Date.now() + 15 * 60 * 1000); // current time + 15 minutes

    const fp = flatpickr(input, {
      enableTime: true,
      time_24hr: true,
      inline: true, // visible calendar
      defaultDate: defaultDateTime,
      dateFormat: "Y-m-d H:i",
      allowInput: true,
      locale: { firstDayOfWeek: 1 },
      onDayCreate(_, __, ___, dayElem) {
        const day = dayElem.dateObj.getDay();
        if (day === 0 || day === 6) dayElem.classList.add("weekend");
      },
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
      // timeout because flatpickr needs to update its values, and we are submitting on enter keydown which happens before the value is updated
      setTimeout(() => {
        const rawDate = fp.input.value;
        const date = fp.parseDate(rawDate) ?? defaultDateTime;
        this.onSubmit(toLocalDateTimeValue(date));
        this.close();
      }, 0);
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

    this.setupMobileKeyboardHandling();
  }

  private setupMobileKeyboardHandling(): void {
    const vv = window.visualViewport;
    if (!vv) return;

    const container = this.containerEl; // .modal-container
    const modal = this.modalEl; // .modal

    const reposition = () => {
      const isKeyboardActive = vv.height < window.innerHeight * 0.85;

      if (!isKeyboardActive) return;
      // Pin the container exactly to the visible part of the screen
      container.style.position = "fixed";
      container.style.top = `${vv.offsetTop}px`;
      container.style.height = `${vv.height}px`;
      container.style.bottom = "auto";

      modal.style.maxHeight = `${vv.height - 20}px`;
    };

    // Both events are needed: resize - keyboard opens/closes | scroll when iOS shifts the viewport offset
    vv.addEventListener("resize", reposition);
    vv.addEventListener("scroll", reposition);

    this.viewportCleanup = () => {
      vv.removeEventListener("resize", reposition);
      vv.removeEventListener("scroll", reposition);

      container.style.top = "";
      container.style.height = "";
      container.style.bottom = "";
      modal.style.maxHeight = "";
    };
  }

  onClose(): void {
    this.viewportCleanup?.();
    this.viewportCleanup = null;
    this.contentEl.empty();
  }
}
