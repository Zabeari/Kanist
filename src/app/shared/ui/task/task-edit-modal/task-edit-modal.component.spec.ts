import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskEditModalComponent } from './task-edit-modal.component';
import { MODAL_DATA, ModalRef } from '@shared/ui/modal/modal-ref';
import { TaskStore } from '@features/projects/presentation/store/task.store';
import { Task } from '@features/projects/domain/entities/task.entity';
import { signal } from '@angular/core';
import { startOfToday, toDateInputValue } from '@shared/utils/date-input.util';

describe('TaskEditModalComponent', () => {
  let fixture: ComponentFixture<TaskEditModalComponent>;
  let modalRef: ModalRef<void>;

  beforeEach(async () => {
    modalRef = { close: vi.fn() } as unknown as ModalRef<void>;

    await TestBed.configureTestingModule({
      imports: [TaskEditModalComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: MODAL_DATA,
          useValue: {
            id: 't1',
            sectionId: 'sec-1',
            allowSubtasks: false,
            name: 'Write release notes',
            completed: false,
            description: 'Details',
          },
        },
        { provide: ModalRef, useValue: modalRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskEditModalComponent);
    fixture.detectChanges();
  });

  function openStartCalendar(): void {
    fixture.nativeElement.querySelector('#startDate')?.click();
    fixture.detectChanges();
  }

  it('creates the component', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the provided name in the input', () => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#taskName');
    expect(input.value).toBe('Write release notes');
  });

  it('closes the modal when save is submitted', () => {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    expect(modalRef.close).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Write release notes',
      description: 'Details',
      completed: false,
    }));
  });

  it('does not close the modal when start date is before today', () => {
    const yesterday = new Date(startOfToday());
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayInputValue = toDateInputValue(yesterday);

    fixture.componentInstance['taskForm'].controls.startDate.setValue(yesterdayInputValue);
    fixture.componentInstance['taskForm'].controls.startDate.markAsTouched();
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(modalRef.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Start date cannot be before today');
  });

  it('allows saving after clearing start date', () => {
    fixture.componentInstance['taskForm'].controls.startDate.setValue('2099-01-01');
    fixture.detectChanges();

    const clearStartDateButton: HTMLButtonElement = fixture.nativeElement.querySelector('[aria-label="Remove start date"]');
    clearStartDateButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance['taskForm'].controls.startDate.value).toBe('');

    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));

    expect(modalRef.close).toHaveBeenCalled();
  });

  it('clears end date when clear end date is clicked', () => {
    fixture.componentInstance['taskForm'].controls.endDate.setValue('2099-01-01');
    fixture.detectChanges();

    const clearEndDateButton: HTMLButtonElement = fixture.nativeElement.querySelector('[aria-label="Remove due date"]');
    clearEndDateButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance['taskForm'].controls.endDate.value).toBe('');
  });

  it('does not close when end date is before today', () => {
    const yesterday = new Date(startOfToday());
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayInputValue = toDateInputValue(yesterday);

    fixture.componentInstance['taskForm'].controls.endDate.setValue(yesterdayInputValue);
    fixture.componentInstance['taskForm'].controls.endDate.markAsTouched();
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(modalRef.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Due date cannot be before today');
  });

  it('does not close when end date is before start date', () => {
    fixture.componentInstance['taskForm'].controls.startDate.setValue('2099-01-10');
    fixture.componentInstance['taskForm'].controls.endDate.setValue('2099-01-01');
    fixture.componentInstance['taskForm'].controls.endDate.markAsTouched();
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(modalRef.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Due date cannot be before start date');
  });

  it('disables due dates before the start date in the calendar', () => {
    fixture.componentInstance['taskForm'].controls.startDate.setValue('2099-01-10');
    fixture.componentInstance['taskForm'].controls.endDate.setValue('2099-01-20');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('#endDate')?.click();
    fixture.detectChanges();

    const dayBeforeStart: HTMLButtonElement | null = fixture.nativeElement.querySelector('[data-date="2099-01-09"]');
    const startDay: HTMLButtonElement | null = fixture.nativeElement.querySelector('[data-date="2099-01-10"]');

    expect(dayBeforeStart?.disabled).toBe(true);
    expect(dayBeforeStart?.classList.contains('task-meta-date-field__day--disabled')).toBe(true);
    expect(startDay?.disabled).toBe(false);
  });

  it('rejects selecting a due date before the start date in the calendar', () => {
    fixture.componentInstance['taskForm'].controls.startDate.setValue('2099-01-10');
    fixture.componentInstance['taskForm'].controls.endDate.setValue('2099-01-20');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('#endDate')?.click();
    fixture.detectChanges();

    const dayBeforeStart: HTMLButtonElement | null = fixture.nativeElement.querySelector('[data-date="2099-01-09"]');
    dayBeforeStart!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance['taskForm'].controls.endDate.value).toBe('2099-01-20');
  });

  describe('when the task already has a start date set in the past (loaded from backend)', () => {
    let pastDate: Date;
    let originalValue: string;

    beforeEach(async () => {
      TestBed.resetTestingModule();
      modalRef = { close: vi.fn() } as unknown as ModalRef<void>;

      pastDate = new Date(startOfToday());
      pastDate.setDate(pastDate.getDate() - 30);
      originalValue = toDateInputValue(pastDate);

      await TestBed.configureTestingModule({
        imports: [TaskEditModalComponent],
        providers: [
          provideZonelessChangeDetection(),
          {
            provide: MODAL_DATA,
            useValue: {
              id: 't2',
              name: 'Old task',
              completed: false,
              description: '',
              startDate: pastDate,
            },
          },
          { provide: ModalRef, useValue: modalRef },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(TaskEditModalComponent);
      fixture.detectChanges();
    });

    it('allows saving when the existing past start date is unchanged', () => {
      const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
      form.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      expect(modalRef.close).toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).not.toContain('Start date cannot be');
    });

    it('shows past dates as disabled in the calendar', () => {
      openStartCalendar();

      const disabledDay: HTMLButtonElement | null = fixture.nativeElement.querySelector(
        '.task-meta-date-field__day--disabled:not(.task-meta-date-field__day--outside)',
      );

      expect(disabledDay).toBeTruthy();
      expect(disabledDay?.disabled).toBe(true);
    });

    it('rejects selecting a date before today', () => {
      openStartCalendar();

      const disabledDay: HTMLButtonElement | null = fixture.nativeElement.querySelector(
        '.task-meta-date-field__day--disabled:not(.task-meta-date-field__day--outside)',
      );
      expect(disabledDay).toBeTruthy();
      disabledDay!.click();
      fixture.detectChanges();

      expect(fixture.componentInstance['taskForm'].controls.startDate.value).toBe(originalValue);
    });

    it('allows saving when the start date is changed to a future date', () => {
      fixture.componentInstance['taskForm'].controls.startDate.setValue('2099-12-31');
      fixture.detectChanges();

      const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
      form.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      expect(modalRef.close).toHaveBeenCalled();
    });
  });

  describe('when the task already has a start date set in the future', () => {
    beforeEach(async () => {
      TestBed.resetTestingModule();
      modalRef = { close: vi.fn() } as unknown as ModalRef<void>;

      const futureDate = new Date(startOfToday());
      futureDate.setDate(futureDate.getDate() + 30);

      await TestBed.configureTestingModule({
        imports: [TaskEditModalComponent],
        providers: [
          provideZonelessChangeDetection(),
          {
            provide: MODAL_DATA,
            useValue: {
              id: 't3',
              name: 'Upcoming task',
              completed: false,
              description: '',
              startDate: futureDate,
            },
          },
          { provide: ModalRef, useValue: modalRef },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(TaskEditModalComponent);
      fixture.detectChanges();
    });

    it('still enforces the today-or-later restriction when a past date is entered', () => {
      const yesterday = new Date(startOfToday());
      yesterday.setDate(yesterday.getDate() - 1);

      fixture.componentInstance['taskForm'].controls.startDate.setValue(toDateInputValue(yesterday));
      fixture.componentInstance['taskForm'].controls.startDate.markAsTouched();
      fixture.detectChanges();

      const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
      form.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      expect(modalRef.close).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain('Start date cannot be before today');
    });

    it('disables past dates when viewing the current month in the calendar', () => {
      openStartCalendar();

      const previousMonthButton: HTMLButtonElement = fixture.nativeElement.querySelector('[aria-label="Previous month"]');
      for (let index = 0; index < 3; index += 1) {
        previousMonthButton.click();
        fixture.detectChanges();
      }

      const disabledDay: HTMLButtonElement | null = fixture.nativeElement.querySelector(
        '.task-meta-date-field__day--disabled:not(.task-meta-date-field__day--outside)',
      );

      expect(disabledDay).toBeTruthy();
      expect(disabledDay?.disabled).toBe(true);
    });
  });

  it('renders subtasks from TaskStore when allowSubtasks is true', async () => {
    TestBed.resetTestingModule();
    modalRef = { close: vi.fn() } as unknown as ModalRef<void>;

    const sectionId = 'sec-1';
    const parent = Task.create('Parent task', sectionId, undefined, 't1').addSubtask('s1');
    const subtask = Task.create('First subtask', sectionId, undefined, 's1', 't1');
    const onCreateSubtask = vi.fn();

    await TestBed.configureTestingModule({
      imports: [TaskEditModalComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: MODAL_DATA,
          useValue: {
            id: 't1',
            sectionId,
            allowSubtasks: true,
            name: 'Parent task',
            completed: false,
            description: '',
            onCreateSubtask,
          },
        },
        {
          provide: TaskStore,
          useValue: {
            tasks: signal({ t1: parent, s1: subtask }),
          },
        },
        { provide: ModalRef, useValue: modalRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskEditModalComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('First subtask');
    expect(fixture.nativeElement.textContent).toContain('0 of 1 done');

    fixture.nativeElement.querySelector('.task-detail__add-subtask')?.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('.task-detail__subtask-input');
    input.value = 'Another subtask';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(onCreateSubtask).toHaveBeenCalledWith('Another subtask');
  });
});
