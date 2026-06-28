import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { AutoFocusDirective } from '@shared/directives/auto-focus.directive';
import { MODAL_DATA, ModalRef } from '@shared/ui/modal/modal-ref';
import {
  TaskDetailsModalResult,
  TaskDetailsModalState,
  TaskDetailsModalSubtask,
} from '@features/projects/presentation/models/task-edit-modal.state';
import { TaskStore } from '@features/projects/presentation/store/task.store';

@Component({
  selector: 'app-task-edit-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AutoFocusDirective],
  templateUrl: './task-edit-modal.component.html',
  styleUrl: './task-edit-modal.component.css',
})
export class TaskEditModalComponent {
  private readonly modalRef = inject(ModalRef);
  private readonly taskStore = inject(TaskStore, { optional: true });
  private readonly modalData = inject<TaskDetailsModalState | null>(MODAL_DATA, { optional: true });

  protected readonly completed = signal(this.modalData?.completed ?? false);
  protected readonly showSubtaskNameErrors = signal(false);
  protected readonly showSubtaskComposer = signal(false);

  protected readonly liveTask = computed(() => {
    const taskId = this.modalData?.id;
    if (!taskId || !this.taskStore) {
      return null;
    }

    return this.taskStore.tasks()[taskId] ?? null;
  });

  protected readonly subtasks = computed((): readonly TaskDetailsModalSubtask[] => {
    const taskId = this.modalData?.id;
    if (!taskId || !this.modalData?.allowSubtasks || !this.taskStore) {
      return [];
    }

    const tasks = this.taskStore.tasks();
    const parent = tasks[taskId];
    if (!parent) {
      return [];
    }

    return parent.subtaskIds
      .map((subtaskId) => tasks[subtaskId])
      .filter((task): task is NonNullable<typeof task> => !!task)
      .map((task) => ({
        id: task.id,
        name: task.name,
        completed: task.completed,
      }));
  });

  protected readonly subtaskProgress = computed(() => {
    const items = this.subtasks();
    if (items.length === 0) {
      return null;
    }

    const done = items.filter((item) => item.completed).length;
    return `${done} of ${items.length} done`;
  });

  protected readonly completedAtLabel = computed(() => {
    const completedDate = this.liveTask()?.completedDate;
    if (!completedDate) {
      return null;
    }

    return completedDate.toLocaleDateString(undefined, { dateStyle: 'medium' });
  });

  protected readonly allowSubtasks = this.modalData?.allowSubtasks ?? false;

  private readonly minAllowedStartDate: Date = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = this.modalData?.startDate;
    if (existing) {
      const existingNormalized = new Date(existing);
      existingNormalized.setHours(0, 0, 0, 0);
      if (existingNormalized < today) return existingNormalized;
    }

    return today;
  })();

  protected readonly minStartDate: string = this.toDateInputValue(this.minAllowedStartDate);

  private readonly existingStartDateIsInPast: boolean = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = this.modalData?.startDate;
    if (!existing) return false;
    const existingNormalized = new Date(existing);
    existingNormalized.setHours(0, 0, 0, 0);
    return existingNormalized < today;
  })();

  protected readonly taskForm = new FormGroup({
    name: new FormControl(this.modalData?.name ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(50)],
    }),
    description: new FormControl(this.modalData?.description ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    startDate: new FormControl(this.toDateInputValue(this.modalData?.startDate), {
      nonNullable: true,
      validators: [
        this.minDateValidator(
          this.minAllowedStartDate,
          this.existingStartDateIsInPast ? 'minOriginalDate' : 'minToday',
        ),
      ],
    }),
    endDate: new FormControl(this.toDateInputValue(this.modalData?.endDate), {
      nonNullable: true,
    }),
  }, { validators: [this.endDateAfterStartDateValidator()] });

  protected readonly subtaskNameCtrl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2), Validators.maxLength(50)],
  });

  protected get nameError(): string | null {
    const errors = this.taskForm.controls.name.errors;
    if (!errors) return null;
    if (errors['required']) return 'Task name is required';
    if (errors['minlength']) return 'Must be at least 2 characters';
    if (errors['maxlength']) return 'Must be at most 50 characters';
    return null;
  }

  protected get subtaskNameError(): string | null {
    const errors = this.subtaskNameCtrl.errors;
    if (!errors) return null;
    if (errors['required']) return 'Subtask name is required';
    if (errors['minlength']) return 'Must be at least 2 characters';
    if (errors['maxlength']) return 'Must be at most 50 characters';
    return null;
  }

  protected toggleCompletion(): void {
    this.completed.update((value) => !value);
  }

  protected get startDateError(): string | null {
    const errors = this.taskForm.controls.startDate.errors;
    if (!errors) return null;
    if (errors['minToday']) return 'Start date cannot be before today';
    if (errors['minOriginalDate']) return 'Start date cannot be moved further into the past than the original date';
    return null;
  }

  protected get endDateError(): string | null {
    if (this.taskForm.hasError('endBeforeStartDate')) {
      return 'End date cannot be before start date';
    }
    return null;
  }

  protected clearStartDate(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.taskForm.controls.startDate.setValue('');
    this.taskForm.controls.startDate.markAsTouched();
    this.taskForm.controls.startDate.updateValueAndValidity();
  }

  protected clearEndDate(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.taskForm.controls.endDate.setValue('');
    this.taskForm.controls.endDate.markAsTouched();
    this.taskForm.controls.endDate.updateValueAndValidity();
  }

  protected formatDisplayDate(value: string): string {
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

  protected openSubtaskComposer(): void {
    this.showSubtaskNameErrors.set(false);
    this.subtaskNameCtrl.reset();
    this.showSubtaskComposer.set(true);
  }

  protected closeSubtaskComposer(): void {
    this.showSubtaskNameErrors.set(false);
    this.subtaskNameCtrl.reset();
    this.showSubtaskComposer.set(false);
  }

  protected toggleSubtask(subtaskId: string): void {
    this.modalData?.onToggleSubtask?.(subtaskId);
  }

  protected addSubtask(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.subtaskNameCtrl.invalid) {
      this.showSubtaskNameErrors.set(true);
      this.subtaskNameCtrl.markAsTouched();
      return;
    }

    const name = this.subtaskNameCtrl.value.trim();
    this.modalData?.onCreateSubtask?.(name);
    this.closeSubtaskComposer();
  }

  protected save(): void {
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }

    const { name, description, startDate, endDate } = this.taskForm.getRawValue();
    this.modalRef.close({
      name,
      description,
      startDate,
      endDate,
      completed: this.completed(),
    } satisfies TaskDetailsModalResult);
  }

  protected cancel(): void {
    this.modalRef.close();
  }

  private toDateInputValue(date?: Date | null): string {
    if (!date) return '';

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private minDateValidator(minDate: Date, errorKey: string): ValidatorFn {
    return (control: AbstractControl<string>): ValidationErrors | null => {
      const value = control.value;
      if (!value) return null;

      const selectedDate = new Date(`${value}T00:00:00`);
      if (Number.isNaN(selectedDate.getTime())) return null;

      return selectedDate < minDate ? { [errorKey]: true } : null;
    };
  }

  private endDateAfterStartDateValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const group = control as FormGroup<{
        startDate: FormControl<string>;
        endDate: FormControl<string>;
      }>;

      const startValue = group.controls.startDate.value;
      const endValue = group.controls.endDate.value;
      if (!startValue || !endValue) return null;

      const startDate = new Date(`${startValue}T00:00:00`);
      const endDate = new Date(`${endValue}T00:00:00`);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;

      return endDate < startDate ? { endBeforeStartDate: true } : null;
    };
  }
}
