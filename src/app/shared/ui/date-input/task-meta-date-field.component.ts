import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  HostListener,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ClickOutsideDirective } from '@shared/directives/click-outside.directive';
import {
  buildCalendarMonth,
  CALENDAR_WEEKDAY_LABELS,
  formatCalendarTitle,
  formatDisplayDate,
  parseDateInputValue,
  startOfToday,
  toDateInputValue,
  type CalendarDayCell,
} from '@shared/utils/date-input.util';

export type TaskMetaDateFieldIcon = 'calendar' | 'clock';

@Component({
  selector: 'app-task-meta-date-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClickOutsideDirective],
  templateUrl: './task-meta-date-field.component.html',
  styleUrl: './task-meta-date-field.component.css',
  host: {
    class: 'task-meta-date-field',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TaskMetaDateFieldComponent),
      multi: true,
    },
  ],
})
export class TaskMetaDateFieldComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly icon = input.required<TaskMetaDateFieldIcon>();
  readonly inputId = input.required<string>();
  readonly minDate = input.required<string>();
  readonly ariaLabel = input.required<string>();
  readonly removeAriaLabel = input.required<string>();
  readonly errorMessage = input<string | null>(null);
  readonly showError = input(false);

  protected readonly weekdayLabels = CALENDAR_WEEKDAY_LABELS;
  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly pickerOpen = signal(false);
  protected readonly viewYear = signal(startOfToday().getFullYear());
  protected readonly viewMonth = signal(startOfToday().getMonth());

  protected readonly calendarTitle = computed(() =>
    formatCalendarTitle(this.viewYear(), this.viewMonth()),
  );

  protected readonly calendarDays = computed(() =>
    buildCalendarMonth(this.viewYear(), this.viewMonth(), {
      minDate: this.minDate(),
      selectedValue: this.value(),
      todayValue: toDateInputValue(startOfToday()),
    }),
  );

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected displayValue(): string {
    return formatDisplayDate(this.value());
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  @HostListener('keydown.escape')
  protected onEscape(): void {
    if (this.pickerOpen()) {
      this.closePicker();
    }
  }

  protected togglePicker(event: Event): void {
    event.stopPropagation();
    if (this.disabled()) {
      return;
    }

    if (this.pickerOpen()) {
      this.closePicker();
      return;
    }

    this.syncViewToValue();
    this.pickerOpen.set(true);
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
  }

  protected previousMonth(event: Event): void {
    event.stopPropagation();
    if (this.viewMonth() === 0) {
      this.viewMonth.set(11);
      this.viewYear.update((year) => year - 1);
      return;
    }

    this.viewMonth.update((month) => month - 1);
  }

  protected nextMonth(event: Event): void {
    event.stopPropagation();
    if (this.viewMonth() === 11) {
      this.viewMonth.set(0);
      this.viewYear.update((year) => year + 1);
      return;
    }

    this.viewMonth.update((month) => month + 1);
  }

  protected selectDay(day: CalendarDayCell, event: Event): void {
    event.stopPropagation();
    if (day.isDisabled) {
      return;
    }

    this.value.set(day.dateValue);
    this.onChange(day.dateValue);
    this.onTouched();
    this.closePicker();
  }

  protected clear(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.value.set('');
    this.onChange('');
    this.onTouched();
    this.closePicker();
  }

  private syncViewToValue(): void {
    const currentValue = this.value();
    if (currentValue) {
      const parsed = parseDateInputValue(currentValue);
      if (parsed) {
        this.viewYear.set(parsed.getFullYear());
        this.viewMonth.set(parsed.getMonth());
        return;
      }
    }

    const today = startOfToday();
    this.viewYear.set(today.getFullYear());
    this.viewMonth.set(today.getMonth());
  }
}
