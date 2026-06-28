import { Component, forwardRef, inject, Injector, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  TaskEditEvent,
  TaskDeleteEvent,
  TaskRenameEvent,
  TaskSubtaskCreateEvent,
  TaskToggleEvent,
  TaskViewModel,
} from '@features/projects/presentation/models/project.view-model';
import { TaskDetailsModalResult } from '@features/projects/presentation/models/task-edit-modal.state';
import { AutoFocusDirective } from '@shared/directives/auto-focus.directive';
import { ConfirmComponent } from '@shared/ui/modal/confirm/confirm.component';
import { ModalService } from '@shared/ui/modal/modal.service';
import { TaskEditModalComponent } from '@shared/ui/task/task-edit-modal/task-edit-modal.component';

@Component({
  selector: 'app-task',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, ReactiveFormsModule, AutoFocusDirective, forwardRef(() => TaskComponent)],
  templateUrl: './task.component.html',
  styleUrl: './task.component.css',
})
export class TaskComponent {
  private readonly modalService = inject(ModalService);
  private readonly injector = inject(Injector);

  public taskInfo = input.required<TaskViewModel>();
  public sectionId = input.required<string>();
  public allowSubtasks = input(true);

  public taskToggle = output<TaskToggleEvent>();
  public taskRename = output<TaskRenameEvent>();
  public taskDelete = output<TaskDeleteEvent>();
  public taskEdit = output<TaskEditEvent>();
  public taskSubtaskCreate = output<TaskSubtaskCreateEvent>();

  protected menuOpen = signal(false);
  protected editing = signal(false);
  private cancellingEdit = false;

  protected taskNameCtrl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2), Validators.maxLength(50)],
  });

  protected get taskNameError(): string | null {
    const errors = this.taskNameCtrl.errors;
    if (!errors) return null;
    if (errors['required']) return 'Task name is required';
    if (errors['minlength']) return 'Must be at least 2 characters';
    if (errors['maxlength']) return 'Must be at most 50 characters';
    return null;
  }

  protected sendTaskCompletedChange() {
    this.taskToggle.emit({ id: this.taskInfo().id });
  }

  protected openTaskDetails(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('.completed-button-container, .task-menu-wrapper')) return;

    event.stopPropagation();

    if (event instanceof KeyboardEvent) {
      event.preventDefault();
    }

    if (this.editing()) return;

    const initialCompleted = this.taskInfo().completed;
    const taskId = this.taskInfo().id;
    const sectionId = this.sectionId();

    this.menuOpen.set(false);
    this.modalService.open(TaskEditModalComponent, {
      title: 'Task details',
      size: 'wide',
      parentInjector: this.injector,
      data: {
        id: taskId,
        sectionId,
        allowSubtasks: this.allowSubtasks(),
        name: this.taskInfo().name,
        completed: this.taskInfo().completed,
        description: this.taskInfo().description ?? '',
        startDate: this.taskInfo().startDate,
        endDate: this.taskInfo().endDate,
        onCreateSubtask: (name: string) => {
          this.taskSubtaskCreate.emit({ parentTaskId: taskId, sectionId, name });
        },
        onToggleSubtask: (subtaskId: string) => {
          this.taskToggle.emit({ id: subtaskId });
        },
      },
      onClose: (result?: unknown) => {
        if (!result || typeof result !== 'object') return;

        const modalResult = result as TaskDetailsModalResult;
        const startDate = this.parseDateInputValue(modalResult.startDate);
        const endDate = this.parseDateInputValue(modalResult.endDate);
        const completedChanged = modalResult.completed !== initialCompleted;

        this.taskEdit.emit({
          id: taskId,
          sectionId,
          name: modalResult.name,
          description: modalResult.description.trim() || undefined,
          startDate,
          endDate,
          completedChanged,
        });
      },
    });
  }

  protected toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((v) => !v);
  }

  protected closeMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);
  }

  protected onEdit(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.taskNameCtrl.setValue(this.taskInfo().name);
    this.taskNameCtrl.markAsUntouched();
    this.cancellingEdit = false;
    this.editing.set(true);
  }

  protected onSave(event?: Event): void {
    event?.stopPropagation();
    if (event instanceof KeyboardEvent) {
      event.preventDefault();
    }

    if (this.cancellingEdit) {
      this.cancellingEdit = false;
      return;
    }

    if (this.taskNameCtrl.invalid) {
      this.taskNameCtrl.markAsTouched();
      return;
    }

    const name = this.taskNameCtrl.value.trim();
    if (name !== this.taskInfo().name) {
      this.taskRename.emit({ id: this.taskInfo().id, name });
    }

    this.editing.set(false);
  }

  protected onCancel(event?: Event): void {
    event?.stopPropagation();
    if (event instanceof KeyboardEvent) {
      event.preventDefault();
    }

    this.cancellingEdit = true;
    this.taskNameCtrl.markAsUntouched();
    this.editing.set(false);
  }

  protected onDelete(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);

    this.modalService.open(ConfirmComponent, {
      title: 'Delete task',
      data: {
        entityName: this.taskInfo().name,
        confirmLabel: 'Delete task',
        cancelLabel: 'Cancel',
      },
      onClose: (confirmed?: unknown) => {
        if (confirmed !== true) return;
        this.taskDelete.emit({ id: this.taskInfo().id, sectionId: this.sectionId() });
      },
    });
  }

  protected forwardTaskToggle(event: TaskToggleEvent): void {
    this.taskToggle.emit(event);
  }

  protected forwardTaskRename(event: TaskRenameEvent): void {
    this.taskRename.emit(event);
  }

  protected forwardTaskDelete(event: TaskDeleteEvent): void {
    this.taskDelete.emit(event);
  }

  protected forwardTaskEdit(event: TaskEditEvent): void {
    this.taskEdit.emit(event);
  }

  private parseDateInputValue(value: string): Date | undefined {
    if (!value) return undefined;

    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
