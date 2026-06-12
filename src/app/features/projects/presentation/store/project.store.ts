import { computed, inject, Injectable, signal } from '@angular/core';
import { LoadProjectUseCase } from '@features/projects/application/use-cases/projects/load-project/load-project.use-case';
import { LoadAllProjectsUseCase } from '@features/projects/application/use-cases/projects/load-all-projects/load-all-projects.use-case';
import { CreateProjectInput, CreateProjectUseCase } from '@features/projects/application/use-cases/projects/create-project/create-project.use-case';
import { ToggleFavoriteUseCase } from '@features/projects/application/use-cases/projects/toggle-favorite/toggle-favorite.use-case';
import { DeleteProjectUseCase } from '@features/projects/application/use-cases/projects/delete-project/delete-project.use-case';
import { UpdateProjectInput, UpdateProjectUseCase } from '@features/projects/application/use-cases/projects/update-project/update-project.use-case';
import { initialProjectState, ProjectState } from '@features/projects/presentation/models/project-state';
import { ProjectOutput } from '@features/projects/application/dtos/project-output';
import {
  ProjectViewModel,
  SectionViewModel,
  TaskViewModel,
} from '@features/projects/presentation/models/project.view-model';
import { SectionStore } from '@features/projects/presentation/store/section.store';
import { TaskStore } from '@features/projects/presentation/store/task.store';
import { ProjectSummaryStore } from '@features/projects/presentation/store/project-summary.store';
import { Section } from '@features/projects/domain/entities/section.entity';
import { ProjectsError } from '@features/projects/application/errors/projects.error';
import { toProjectsUiError } from '@features/projects/presentation/mappers/projects-ui-error.mapper';
import { UiError } from '@features/projects/presentation/models/ui-error';

/**
 * Store for **projects** only.
 *
 * Owns `ProjectState` (projects dictionary + selectedProjectId).
 * Delegates section operations to {@link SectionStore} and task
 * operations to {@link TaskStore}.
 *
 * The `projectView` computed signal reads across all three stores
 * to build the denormalized tree the template needs.
 */
@Injectable()
export class ProjectStore {
  // --------------- Use-case injection ---------------
  private readonly loadProjectUseCase   = inject(LoadProjectUseCase);
  private readonly loadAllProjectsUseCase = inject(LoadAllProjectsUseCase);
  private readonly createProjectUseCase = inject(CreateProjectUseCase);
  private readonly toggleFavoriteUseCase = inject(ToggleFavoriteUseCase);
  private readonly deleteProjectUseCase = inject(DeleteProjectUseCase);
  private readonly updateProjectUseCase = inject(UpdateProjectUseCase);

  // --------------- Peer stores ---------------
  private readonly sectionStore         = inject(SectionStore);
  private readonly taskStore            = inject(TaskStore);
  private readonly projectSummaryStore  = inject(ProjectSummaryStore);

  // --------------- State signal ---------------
  private readonly state = signal<ProjectState>(initialProjectState);

  // ===================================================================
  // SELECTORS — flat (normalized) reads
  // ===================================================================

  /** All projects as an array */
  readonly projects = computed(() => Object.values(this.state().projects));

  /** Currently selected project ID */
  readonly selectedProjectId = computed(() => this.state().selectedProjectId);

  /** Currently selected project entity (or null) */
  readonly selectedProject = computed(() => {
    const id = this.state().selectedProjectId;
    return id ? (this.state().projects[id] ?? null) : null;
  });

  /** Loading flag */
  readonly loading = computed(() => this.state().loading);

  /** Last error */
  readonly error = computed(() => this.state().error);

  /** Last rich error details */
  readonly errorDetails = computed(() => this.state().errorDetails);

  // ===================================================================
  // SELECTORS — denormalized view-model for the UI
  // ===================================================================

  /**
   * Denormalized view of the selected project.
   * Reads from ProjectStore, SectionStore, and TaskStore to build
   * the full `ProjectViewModel` tree (including subtasks).
   */
  readonly projectView = computed<ProjectViewModel | null>(() => {
    const project = this.selectedProject();
    if (!project) return null;

    const sections = this.sectionStore.sections();
    const tasks = this.taskStore.tasks();

    /** Recursively build TaskViewModel tree from a flat tasks dict */
    const buildTaskTree = (taskIds: readonly string[]): TaskViewModel[] =>
      taskIds
        .map(tId => tasks[tId])
        .filter(Boolean)
        .map(task => ({
          id: task.id,
          name: task.name,
          completed: task.completed,
          startDate: task.startDate,
          description: task.description,
          endDate: task.endDate,
          subtasks: buildTaskTree(task.subtaskIds),
        }));

    const sectionViewModels: SectionViewModel[] = project.sectionIds
      .map(sectionId => sections[sectionId])
      .filter((s): s is Section => !!s)
      .map(section => ({
        id: section.id,
        name: section.name,
        taskCount: section.taskIds.length,
        tasks: buildTaskTree(section.taskIds),
      }));

    return {
      id: project.id,
      name: project.name,
      sections: sectionViewModels,
    };
  });

  // ===================================================================
  // ACTIONS — Project
  // ===================================================================

  /**
   * Clear loading state and errors before starting a new request.
   */
  private clearState(): void {
    this.state.update(s => ({
      ...s,
      loading: true,
      error: null,
      errorDetails: null,
    }));
  }

  /** Insert or replace a project in the dictionary. */
  private upsertProject(id: string, project: ProjectOutput): void {
    this.state.update(s => ({
      ...s,
      projects: { ...s.projects, [id]: project },
    }));
  }

  /** Remove a project from the dictionary by id. */
  private removeProject(id: string): void {
    this.state.update(s => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: _, ...rest } = s.projects;
      return { ...s, projects: rest };
    });
  }

  /** Record an error in the store and log it to the console. */
  private setError(message: string, context: string, error: unknown, details: UiError | null = null): void {
    this.state.update(s => ({ ...s, error: message, errorDetails: details }));
    console.error(`Failed to ${context}:`, error);
  }

  private setResultError(error: ProjectsError, context: string): void {
    const uiError = toProjectsUiError(error);
    this.setError(uiError.message, context, error, uiError);
  }

  /**
   * Create a new project with **optimistic UI**.
   *
   * A temporary project is added to the store immediately so the user
   * sees it without waiting for the backend round-trip.  Once the
   * server responds the temporary entry is swapped for the real one;
   * on failure the optimistic entry is rolled back.
   */
  createProject(input: CreateProjectInput): void {
    const tempId = `temp-${Date.now()}`;
    const optimisticProject: ProjectOutput = {
      id: tempId,
      name: input.name,
      favorite: input.favorite,
      sectionIds: [],
    };

    // Show the project in the UI right away
    this.upsertProject(tempId, optimisticProject);
    this.projectSummaryStore.mergePendingCounts({ [tempId]: 0 });

    // Fire the backend request in parallel
    this.createProjectUseCase.execute(input).subscribe({
      next: (result) => {
        if (!result.success) {
          // Revert the optimistic update
          this.removeProject(tempId);
          this.projectSummaryStore.removePendingCount(tempId);
          this.setResultError(result.error, 'create project');
          return;
        }

        const project = result.value;
        // Replace the temp project with the real one from the backend
        this.removeProject(tempId);
        this.upsertProject(project.id, project);
        this.projectSummaryStore.removePendingCount(tempId);
        this.projectSummaryStore.mergePendingCounts({ [project.id]: 0 });
      },
    });
  }

  /**
   * Update an existing project's name and/or favorite status with **optimistic UI**.
   *
   * The store is updated immediately so the user sees the change without delay.
   * If the backend call fails the original state is restored.
   */
  updateProject(input: UpdateProjectInput): void {
    const existing = this.state().projects[input.id];
    if (!existing) return;

    const optimistic: ProjectOutput = {
      ...existing,
      name: input.name,
      favorite: input.favorite,
    };

    this.upsertProject(input.id, optimistic);

    this.updateProjectUseCase.execute(input).subscribe({
      next: (result) => {
        if (!result.success) {
          this.upsertProject(input.id, existing);
          this.setResultError(result.error, 'update project');
          return;
        }

        const updated = result.value;
        this.upsertProject(updated.id, { ...existing, name: updated.name, favorite: input.favorite });
      },
    });
  }

  loadProject(projectId: string): void {
    this.clearState();
    this.state.update(s => ({
      ...s,
      selectedProjectId: projectId,
    }));

    this.loadProjectUseCase.execute(projectId).subscribe({
      next: ({ project, sections, tasks }) => {
        this.sectionStore.mergeSections(sections);
        this.taskStore.mergeTasks(tasks);

        this.upsertProject(project.id, project);
        this.state.update(s => ({
          ...s,
          loading: false,
        }));
      },
      error: (error) => {
        this.state.update(s => ({ ...s, loading: false }));
        this.setError(error.message, 'load project', error);
      },
    });
  }

  /**
   * Load all projects from the API and populate the store.
   * This is called after making a successful login.
   */
  loadAllProjects(): void {
    this.clearState();

    this.loadAllProjectsUseCase.execute().subscribe({
      next: (summaries) => {
        const projectsDict: Record<string, ProjectOutput> = {};
        const pendingCounts: Record<string, number> = {};

        for (const { project, pendingCount } of summaries) {
          projectsDict[project.id] = project;
          pendingCounts[project.id] = pendingCount;
        }

        this.projectSummaryStore.mergePendingCounts(pendingCounts);

        // `loadAllProjects()` returns summaries (no sections yet => `sectionIds: []`).
        // If a full `loadProject()` already happened for some id (e.g. navigating directly
        // to `/projects/:id` on reload), we must not overwrite its `sectionIds`.
        this.state.update(s => {
          const mergedProjects: Record<string, ProjectOutput> = { ...projectsDict };
          for (const [id, existing] of Object.entries(s.projects)) {
            const incoming = mergedProjects[id];
            if (!incoming) continue;
            if (existing.sectionIds.length > 0) {
              mergedProjects[id] = { ...incoming, sectionIds: existing.sectionIds };
            }
          }

          return {
            ...s,
            projects: mergedProjects,
            loading: false,
          };
        });

        // Auto-select the first project if none is selected yet
        const ids = Object.keys(projectsDict);
        if (!this.state().selectedProjectId && ids.length > 0) {
          this.loadProject(ids[0]);
        }
      },
      error: (error) => {
        this.state.update(s => ({ ...s, loading: false }));
        this.setError(error.message, 'load all projects', error);
      },
    });
  }

  /**
   * Toggle a project's favorite status with **optimistic UI**.
   *
   * The store is updated immediately so the user sees the change
   * without delay.  If the backend call fails the original state
   * is restored.
   */
  toggleProjectFavorite(projectId: string): void {
    const project = this.state().projects[projectId];
    if (!project) return;

    const toggledFavorite = !project.favorite;
    const toggled: ProjectOutput = { ...project, favorite: toggledFavorite };

    // Update the UI immediately
    this.upsertProject(projectId, toggled);

    // Then call the backend
    this.toggleFavoriteUseCase.execute(projectId, toggledFavorite).subscribe({
      error: (error) => {
        // Revert to the original project on failure
        this.upsertProject(projectId, project);
        this.setError(error.message, 'toggle favorite', error);
      },
    });
  }

  /**
   * Delete a project with **optimistic UI**.
   *
   * The project is removed from the store immediately.
   * If the backend call fails the project is restored.
   * When the deleted project was the selected one, the first
   * remaining project is auto-selected.
   */
  deleteProject(projectId: string): void {
    const project = this.state().projects[projectId];
    if (!project) return;

    this.removeProject(projectId);
    this.projectSummaryStore.removePendingCount(projectId);

    if (this.state().selectedProjectId === projectId) {
      const ids = Object.keys(this.state().projects);
      if (ids.length > 0) {
        // RELOAD: First project in list when we delete a project
        this.loadProject(ids[0]);
      } else {
        this.state.update(s => ({ ...s, selectedProjectId: null }));
      }
    }

    this.deleteProjectUseCase.execute(projectId).subscribe({
      error: (error) => {
        this.upsertProject(projectId, project);
        this.setError(error.message, 'delete project', error);
      },
    });
  }

  // ===================================================================
  // ACTIONS — Section (delegated)
  // ===================================================================

  /** Update a section's name (optimistic, delegates to SectionStore) */
  updateSectionName(sectionId: string, newName: string): void {
    this.sectionStore.updateSection(sectionId, newName);
  }

  /**
   * Delete a section from the currently selected project (optimistic).
   * Removes the sectionId from the project's `sectionIds` and delegates
   * the HTTP call to SectionStore.
   */
  deleteSectionFromProject(sectionId: string): void {
    const projectId = this.state().selectedProjectId;
    if (!projectId) return;

    this.sectionStore.deleteSection(projectId, sectionId, () => {
      const existing = this.state().projects[projectId];
      if (!existing) return;
      this.upsertProject(projectId, {
        ...existing,
        sectionIds: existing.sectionIds.filter(id => id !== sectionId),
      });
    });
  }

  /** Create a section inside the currently selected project */
  createSection(sectionName: string): void {
    const projectId = this.state().selectedProjectId;
    if (!projectId) {
      console.error('Cannot create section: no project selected');
      return;
    }

    // Keep ProjectOutput.sectionIds in sync so the UI doesn't need to scan every section.
    this.sectionStore.createSection(projectId, sectionName, (section) => {
      const existing = this.state().projects[projectId];
      if (!existing) return;
      if (existing.sectionIds.includes(section.id)) return;

      this.upsertProject(projectId, {
        ...existing,
        sectionIds: [...existing.sectionIds, section.id],
      });
    });
  }

  // ===================================================================
  // ACTIONS — Task (delegated)
  // ===================================================================

  /** Create a task inside a given section */
  createTask(sectionId: string, taskName: string): void {
    const projectId = this.state().selectedProjectId;
    if (!projectId) {
      console.error('Cannot create task: no project selected');
      return;
    }

    this.taskStore.createTask(projectId, sectionId, taskName, (task) => {
      // Link the new task to the section
      this.sectionStore.addTaskToSection(sectionId, task.id);
    });
  }

  /** Create a subtask under an existing task */
  createSubtask(parentTaskId: string, sectionId: string, taskName: string): void {
    const projectId = this.state().selectedProjectId;
    if (!projectId) {
      console.error('Cannot create subtask: no project selected');
      return;
    }

    this.taskStore.createSubtask(parentTaskId, projectId, sectionId, taskName);
  }

  /** Toggle a task's completed status */
  toggleTaskCompletion(taskId: string): void {
    const projectId = this.state().selectedProjectId;
    if (!projectId) {
      console.error('Cannot toggle task completion: no project selected');
      return;
    }

    this.taskStore.toggleTaskCompletion(projectId, taskId);
  }

  /** Update a task name */
  updateTaskName(taskId: string, name: string): void {
    const projectId = this.state().selectedProjectId;
    if (!projectId) {
      console.error('Cannot update task: no project selected');
      return;
    }

    this.taskStore.updateTaskName(projectId, taskId, name);
  }

  /** Update task fields from edit modal */
  editTask(
    taskId: string,
    name: string,
    description?: string,
    startDate?: Date,
    endDate?: Date,
    completionChanged?: boolean,
  ): void {
    const projectId = this.state().selectedProjectId;
    if (!projectId) {
      console.error('Cannot edit task: no project selected');
      return;
    }

    this.taskStore.editTask(projectId, taskId, name, description, startDate, endDate, completionChanged);
  }

  /** Delete a task from section */
  deleteTask(sectionId: string, taskId: string): void {
    const projectId = this.state().selectedProjectId;
    if (!projectId) {
      console.error('Cannot delete task: no project selected');
      return;
    }

    this.taskStore.deleteTask(projectId, sectionId, taskId, () => {
      this.sectionStore.removeTaskFromSection(sectionId, taskId);
    });
  }

}
