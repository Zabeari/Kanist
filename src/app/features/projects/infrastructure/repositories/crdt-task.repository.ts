import { Injectable, inject } from '@angular/core';
import { defer, Observable } from 'rxjs';
import { DatabaseService } from '@core/persistence/database.service';
import { base64ToBytes, bytesToBase64 } from '@core/persistence/bytes.util';
import { Task } from '@features/projects/domain/entities/task.entity';
import { TaskRepository } from '@features/projects/domain/repositories/task.repository';
import { YProjectDocument } from '@features/projects/infrastructure/crdt/y-project-document';

@Injectable()
export class CrdtTaskRepository extends TaskRepository {
  private readonly database = inject(DatabaseService);

  create(projectId: string, task: Task): Observable<Task> {
    return defer(() => this.createTask(projectId, task));
  }

  update(projectId: string, task: Task): Observable<Task> {
    return defer(() => this.updateTask(projectId, task));
  }

  complete(
    projectId: string,
    sectionId: string,
    taskId: string,
    completedDate: string,
  ): Observable<Task> {
    return defer(() => this.completeTask(projectId, sectionId, taskId, completedDate));
  }

  uncomplete(projectId: string, sectionId: string, taskId: string): Observable<Task> {
    return defer(() => this.uncompleteTask(projectId, sectionId, taskId));
  }

  delete(projectId: string, sectionId: string, taskId: string): Observable<void> {
    return defer(() => this.deleteTask(projectId, sectionId, taskId));
  }

  findById(projectId: string, sectionId: string, taskId: string): Observable<Task> {
    return defer(() => this.findTaskById(projectId, sectionId, taskId));
  }

  private async createTask(projectId: string, task: Task): Promise<Task> {
    const yDoc = await this.loadProjectDocument(projectId);
    yDoc.createTask(task);
    await this.persistProjectState(projectId, yDoc);
    return task;
  }

  private async updateTask(projectId: string, task: Task): Promise<Task> {
    const yDoc = await this.loadProjectDocument(projectId);
    yDoc.updateTask(task);
    await this.persistProjectState(projectId, yDoc);
    return task;
  }

  private async completeTask(
    projectId: string,
    _sectionId: string,
    taskId: string,
    completedDate: string,
  ): Promise<Task> {
    const yDoc = await this.loadProjectDocument(projectId);
    yDoc.completeTask(taskId, new Date(completedDate));
    await this.persistProjectState(projectId, yDoc);

    const task = yDoc.findTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId} in project ${projectId}`);
    }

    return task;
  }

  private async uncompleteTask(
    projectId: string,
    _sectionId: string,
    taskId: string,
  ): Promise<Task> {
    const yDoc = await this.loadProjectDocument(projectId);
    yDoc.uncompleteTask(taskId);
    await this.persistProjectState(projectId, yDoc);

    const task = yDoc.findTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId} in project ${projectId}`);
    }

    return task;
  }

  private async deleteTask(
    projectId: string,
    _sectionId: string,
    taskId: string,
  ): Promise<void> {
    const yDoc = await this.loadProjectDocument(projectId);
    yDoc.deleteTask(taskId);
    await this.persistProjectState(projectId, yDoc);
  }

  private async findTaskById(
    projectId: string,
    _sectionId: string,
    taskId: string,
  ): Promise<Task> {
    const yDoc = await this.loadProjectDocument(projectId);
    const task = yDoc.findTask(taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId} in project ${projectId}`);
    }

    return task;
  }

  private async loadProjectDocument(projectId: string): Promise<YProjectDocument> {
    const yjsState = await this.database.getProjectState(projectId);
    if (!yjsState) {
      throw new Error(`Project state not found: ${projectId}`);
    }

    return YProjectDocument.load(base64ToBytes(yjsState));
  }

  private async persistProjectState(projectId: string, yDoc: YProjectDocument): Promise<void> {
    await this.database.updateProjectState(projectId, bytesToBase64(yDoc.encodeState()));
  }
}
