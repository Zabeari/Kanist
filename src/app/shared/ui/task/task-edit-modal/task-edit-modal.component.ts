import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AutoFocusDirective } from '@shared/directives/auto-focus.directive';
import { TaskMetaDateFieldComponent } from '@shared/ui/date-input/task-meta-date-field.component';
import { MODAL_DATA, ModalRef } from '@shared/ui/modal/modal-ref';
import {
  isDateInputBefore,
  laterDateInputValue,
  minDateUnlessOriginalValidator,
  startOfToday,
  toDateInputValue,
} from '@shared/utils/date-input.util';
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
  imports: [ReactiveFormsModule, AutoFocusDirective, TaskMetaDateFieldComponent],
  templateUrl: './task-edit-modal.component.html',
  styleUrl: './task-edit-modal.component.css',
})
export class TaskEditModalComponent {
  private readonly modalRef = inject(ModalRef);
  private readonly taskStore = inject(TaskStore, { optional: true });
  private readonly modalData = inject<TaskDetailsModalState | null>(MODAL_DATA, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  protected readonly completed = signal(this.modalData?.completed ?? false);
  protected readonly showSubtaskNameErrors = signal(false);
  protected readonly showSubtaskComposer = signal(false);

  private readonly originalStartDate = toDateInputValue(this.modalData?.startDate);
  private readonly originalEndDate = toDateInputValue(this.modalData?.endDate);

  protected readonly minTodayDate = toDateInputValue(startOfToday());
  protected readonly startDateValue = signal(this.originalStartDate);
  protected readonly minEndDate = computed(() =>
    laterDateInputValue(this.startDateValue(), this.minTodayDate),
  );

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

  protected readonly taskForm = new FormGroup({
    name: new FormControl(this.modalData?.name ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(50)],
    }),
    description: new FormControl(this.modalData?.description ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    startDate: new FormControl(this.originalStartDate, {
      nonNullable: true,
      validators: [
        minDateUnlessOriginalValidator(startOfToday(), this.originalStartDate, 'minToday'),
      ],
    }),
    endDate: new FormControl(this.originalEndDate, {
      nonNullable: true,
      validators: [(control) => this.validateEndDate(control)],
    }),
  });

  constructor() {
    this.taskForm.controls.startDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.startDateValue.set(value);
        this.taskForm.controls.endDate.updateValueAndValidity();
      });
  }

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
    return null;
  }

  protected get endDateError(): string | null {
    const errors = this.taskForm.controls.endDate.errors;
    if (errors?.['minStartDate']) return 'Due date cannot be before start date';
    if (errors?.['minToday']) return 'Due date cannot be before today';
    return null;
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

  private validateEndDate(control: AbstractControl<string>): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;

    const startDate = this.startDateValue();
    if (startDate && isDateInputBefore(value, startDate)) {
      return { minStartDate: true };
    }

    if (isDateInputBefore(value, this.minTodayDate)) {
      return { minToday: true };
    }

    return null;
  }
}
