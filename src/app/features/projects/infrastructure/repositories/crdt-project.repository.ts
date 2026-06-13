import { Injectable, inject } from '@angular/core';
import { defer, Observable } from 'rxjs';
import { DatabaseClient, DatabaseService } from '@core/persistence/database.service';
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

interface ProjectRow {
  id: string;
  name: string;
  favorite: number;
  share_key: string;
  schema_version: number;
  created_at: number;
  updated_at: number;
}

interface ProjectStateRow {
  yjs_state: string;
}

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
    const shareKey = crypto.randomUUID();

    await this.database.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO projects (id, name, favorite, share_key, schema_version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          project.id,
          project.name.value,
          project.favorite ? 1 : 0,
          shareKey,
          PROJECT_SCHEMA_VERSION,
          now,
          now,
        ],
      );

      await this.persistProjectState(project.id, yDoc, tx);
    });

    return project;
  }

  private async findProjectById(projectId: string): Promise<ProjectAggregate> {
    const rows = await this.database.select<ProjectRow>(
      'SELECT id, name, favorite, share_key, schema_version, created_at, updated_at FROM projects WHERE id = $1',
      [projectId],
    );

    if (rows.length === 0) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const row = rows[0];
    const stateRows = await this.database.select<ProjectStateRow>(
      'SELECT yjs_state FROM project_state WHERE project_id = $1',
      [projectId],
    );

    if (stateRows.length === 0) {
      throw new Error(`Project state not found: ${projectId}`);
    }

    const yDoc = YProjectDocument.load(base64ToBytes(stateRows[0].yjs_state));
    const meta = yDoc.getMeta();

    return {
      project: this.toProject(row.id, meta.name, meta.favorite),
      sections: [],
      tasks: [],
    };
  }

  private async getAllProjects(): Promise<ProjectSummary[]> {
    const rows = await this.database.select<ProjectRow>(
      'SELECT id, name, favorite, share_key, schema_version, created_at, updated_at FROM projects ORDER BY created_at ASC',
    );

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

    const now = Date.now();
    await this.database.transaction(async (tx) => {
      await tx.execute(
        `UPDATE projects
         SET name = $1, favorite = $2, updated_at = $3
         WHERE id = $4`,
        [project.name.value, project.favorite ? 1 : 0, now, project.id],
      );

      await this.persistProjectState(project.id, existing, tx);
    });

    return project;
  }

  private async deleteProject(projectId: string): Promise<void> {
    await this.database.execute('DELETE FROM projects WHERE id = $1', [projectId]);
  }

  private async toggleProjectFavorite(projectId: string, favorite: boolean): Promise<void> {
    const yDoc = await this.loadProjectDocument(projectId);
    yDoc.setMeta({ favorite });

    const now = Date.now();
    await this.database.transaction(async (tx) => {
      await tx.execute(
        'UPDATE projects SET favorite = $1, updated_at = $2 WHERE id = $3',
        [favorite ? 1 : 0, now, projectId],
      );

      await this.persistProjectState(projectId, yDoc, tx);
    });
  }

  private async loadProjectDocument(projectId: string): Promise<YProjectDocument> {
    const stateRows = await this.database.select<ProjectStateRow>(
      'SELECT yjs_state FROM project_state WHERE project_id = $1',
      [projectId],
    );

    if (stateRows.length === 0) {
      throw new Error(`Project state not found: ${projectId}`);
    }

    return YProjectDocument.load(base64ToBytes(stateRows[0].yjs_state));
  }

  private async persistProjectState(
    projectId: string,
    yDoc: YProjectDocument,
    db: DatabaseClient,
  ): Promise<void> {
    const yjsState = bytesToBase64(yDoc.encodeState());

    await db.execute(
      `INSERT INTO project_state (project_id, yjs_state)
       VALUES ($1, $2)
       ON CONFLICT(project_id) DO UPDATE SET yjs_state = excluded.yjs_state`,
      [projectId, yjsState],
    );
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
