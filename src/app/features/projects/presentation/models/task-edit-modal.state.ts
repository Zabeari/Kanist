export interface TaskDetailsModalSubtask {
  id: string;
  name: string;
  completed: boolean;
}

/** Task sheet modal: view details, edit fields, manage subtasks. */
export interface TaskDetailsModalState {
  id: string;
  sectionId: string;
  allowSubtasks: boolean;
  name: string;
  completed?: boolean;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  onCreateSubtask?: (name: string) => void;
  onToggleSubtask?: (subtaskId: string) => void;
}

/** @deprecated Use TaskDetailsModalState */
export type TaskEditModalState = TaskDetailsModalState;

/** @deprecated Use TaskDetailsModalSubtask */
export type TaskEditModalSubtask = TaskDetailsModalSubtask;

export interface TaskDetailsModalResult {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  completed: boolean;
}

/** @deprecated Use TaskDetailsModalResult */
export type TaskEditModalResult = TaskDetailsModalResult;
