import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TaskMetaDateFieldComponent } from './task-meta-date-field.component';
import { startOfToday, toDateInputValue } from '@shared/utils/date-input.util';

describe('TaskMetaDateFieldComponent', () => {
  let fixture: ComponentFixture<TaskMetaDateFieldComponent>;
  let component: TaskMetaDateFieldComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskMetaDateFieldComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskMetaDateFieldComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('label', 'Start');
    fixture.componentRef.setInput('icon', 'calendar');
    fixture.componentRef.setInput('inputId', 'startDate');
    fixture.componentRef.setInput('minDate', toDateInputValue(startOfToday()));
    fixture.componentRef.setInput('ariaLabel', 'Start date');
    fixture.componentRef.setInput('removeAriaLabel', 'Remove start date');
    fixture.detectChanges();
  });

  function openPicker(): void {
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.task-meta-date-field__trigger');
    trigger.click();
    fixture.detectChanges();
  }

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('marks dates before the minimum as disabled in the calendar', () => {
    openPicker();

    const yesterday = new Date(startOfToday());
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayValue = toDateInputValue(yesterday);
    const disabledDay: HTMLButtonElement | null = fixture.nativeElement.querySelector(`[data-date="${yesterdayValue}"]`);

    expect(disabledDay).toBeTruthy();
    expect(disabledDay?.disabled).toBe(true);
    expect(disabledDay?.classList.contains('task-meta-date-field__day--disabled')).toBe(true);
  });

  it('does not accept selecting a disabled day', () => {
    openPicker();

    const disabledDay: HTMLButtonElement | null = fixture.nativeElement.querySelector(
      '.task-meta-date-field__day--disabled:not(.task-meta-date-field__day--outside)',
    );
    expect(disabledDay).toBeTruthy();
    disabledDay!.click();
    fixture.detectChanges();

    expect(component['value']()).toBe('');
    expect(fixture.nativeElement.querySelector('.task-meta-date-field__popover')).toBeTruthy();
  });

  it('selects a valid day and closes the calendar', () => {
    openPicker();

    const enabledDay: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.task-meta-date-field__day:not([disabled])',
    );
    enabledDay.click();
    fixture.detectChanges();

    expect(component['value']()).toBe(enabledDay.getAttribute('data-date'));
    expect(fixture.nativeElement.querySelector('.task-meta-date-field__popover')).toBeNull();
  });

  it('clears the value when remove is clicked', () => {
    component.writeValue('2099-06-20');
    fixture.detectChanges();

    const removeButton: HTMLButtonElement = fixture.nativeElement.querySelector('[aria-label="Remove start date"]');
    removeButton.click();
    fixture.detectChanges();

    expect(component['value']()).toBe('');
  });

  it('shows validation error when configured', () => {
    fixture.componentRef.setInput('errorMessage', 'Due date cannot be before today');
    fixture.componentRef.setInput('showError', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Due date cannot be before today');
  });
});
