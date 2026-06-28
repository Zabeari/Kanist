import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function toDateInputValue(date?: Date | null): string {
  if (!date) return '';

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function parseDateInputValue(value: string): Date | null {
  if (!value) return null;

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isDateInputBefore(value: string, minDate: string): boolean {
  if (!value || !minDate) return false;
  return value < minDate;
}

export function minDateValidator(minDate: Date, errorKey: string): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const value = control.value;
    if (!value) return null;

    const selectedDate = parseDateInputValue(value);
    if (!selectedDate) return null;

    return selectedDate < minDate ? { [errorKey]: true } : null;
  };
}

export function minDateUnlessOriginalValidator(
  minDate: Date,
  originalValue: string,
  errorKey: string,
): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const value = control.value;
    if (!value || value === originalValue) return null;

    const selectedDate = parseDateInputValue(value);
    if (!selectedDate) return null;

    return selectedDate < minDate ? { [errorKey]: true } : null;
  };
}

export function laterDateInputValue(first: string, second: string): string {
  if (!first) return second;
  if (!second) return first;
  return first > second ? first : second;
}

export interface CalendarDayCell {
  dateValue: string;
  day: number;
  inCurrentMonth: boolean;
  isDisabled: boolean;
  isSelected: boolean;
  isToday: boolean;
}

export const CALENDAR_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function formatCalendarTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function buildCalendarMonth(
  viewYear: number,
  viewMonth: number,
  options: {
    minDate: string;
    selectedValue: string;
    todayValue: string;
  },
): CalendarDayCell[] {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const gridStart = new Date(viewYear, viewMonth, 1 - firstOfMonth.getDay());
  const cells: CalendarDayCell[] = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateValue = toDateInputValue(date);

    cells.push({
      dateValue,
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === viewMonth,
      isDisabled: isDateInputBefore(dateValue, options.minDate),
      isSelected: !!options.selectedValue && dateValue === options.selectedValue,
      isToday: dateValue === options.todayValue,
    });
  }

  return cells;
}
