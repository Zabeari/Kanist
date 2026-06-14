import { Injectable, inject } from '@angular/core';
import { defer, Observable } from 'rxjs';
import { DatabaseService } from '@core/persistence/database.service';
import { base64ToBytes, bytesToBase64 } from '@core/persistence/bytes.util';
import {
  ProjectAggregate,
  ProjectRepository,
  ProjectSummary,
} from '@features/projects/domain/repositories/project.repository';
import { Project } from '@features/projects/domain/entities/project.entity';
import { ProjectName } from '@features/projects/domain/value-objects/project-name.value-object';
import {
  PROJECT_SCHEMA_VERSION,
  YProjectDocument,
} from '@features/projects/infrastructure/crdt/y-project-document';

@Injectable()
export class CrdtProjectRepository extends ProjectRepository {
  private readonly database = inject(DatabaseService);

  create(project: Project): Observable<Project> {
    return defer(() => this.createProject(project));
  }

  findById(projectId: string): Observable<ProjectAggregate> {
    return defer(() => this.findProjectById(projectId));
  }

  getAll(): Observable<ProjectSummary[]> {
    return defer(() => this.getAllProjects());
  }

  update(project: Project): Observable<Project> {
    return defer(() => this.updateProject(project));
  }

  delete(projectId: string): Observable<void> {
    return defer(() => this.deleteProject(projectId));
  }

  toggleFavorite(projectId: string, favorite: boolean): Observable<void> {
    return defer(() => this.toggleProjectFavorite(projectId, favorite));
  }

  private async createProject(project: Project): Promise<Project> {
    const now = Date.now();
    const yDoc = YProjectDocument.create(project.name.value, project.favorite);

    await this.database.createProject({
      id: project.id,
      name: project.name.value,
      favorite: project.favorite,
      shareKey: crypto.randomUUID(),
      schemaVersion: PROJECT_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      yjsState: bytesToBase64(yDoc.encodeState()),
    });

    return project;
  }

  private async findProjectById(projectId: string): Promise<ProjectAggregate> {
    const rows = await this.database.listProjects();
    const row = rows.find((project) => project.id === projectId);

    if (!row) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const yjsState = await this.database.getProjectState(projectId);
    if (!yjsState) {
      throw new Error(`Project state not found: ${projectId}`);
    }

    const yDoc = YProjectDocument.load(base64ToBytes(yjsState));
    const meta = yDoc.getMeta();

    return {
      project: this.toProject(row.id, meta.name, meta.favorite),
      sections: [],
      tasks: [],
    };
  }

  private async getAllProjects(): Promise<ProjectSummary[]> {
    const rows = await this.database.listProjects();

    return rows.map((row) => ({
      project: this.toProject(row.id, row.name, row.favorite === 1),
      pendingCount: 0,
    }));
  }

  private async updateProject(project: Project): Promise<Project> {
    const existing = await this.loadProjectDocument(project.id);
    existing.setMeta({
      name: project.name.value,
      favorite: project.favorite,
    });

    await this.database.updateProject({
      id: project.id,
      name: project.name.value,
      favorite: project.favorite,
      updatedAt: Date.now(),
      yjsState: bytesToBase64(existing.encodeState()),
    });

    return project;
  }

  private async deleteProject(projectId: string): Promise<void> {
    await this.database.deleteProject(projectId);
  }

  private async toggleProjectFavorite(projectId: string, favorite: boolean): Promise<void> {
    const yDoc = await this.loadProjectDocument(projectId);
    yDoc.setMeta({ favorite });

    await this.database.toggleProjectFavorite({
      id: projectId,
      favorite,
      updatedAt: Date.now(),
      yjsState: bytesToBase64(yDoc.encodeState()),
    });
  }

  private async loadProjectDocument(projectId: string): Promise<YProjectDocument> {
    const yjsState = await this.database.getProjectState(projectId);
    if (!yjsState) {
      throw new Error(`Project state not found: ${projectId}`);
    }

    return YProjectDocument.load(base64ToBytes(yjsState));
  }

  private toProject(id: string, name: string, favorite: boolean): Project {
    const nameResult = ProjectName.tryCreate(name);
    if (nameResult.success) {
      return new Project(id, nameResult.value, favorite, []);
    }

    const fallback = ProjectName.tryCreate('Untitled');
    if (!fallback.success) {
      throw new Error('Failed to map project name');
    }

    return new Project(id, fallback.value, favorite, []);
  }
}
