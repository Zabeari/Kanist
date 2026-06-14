import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

export interface ProjectRow {
  id: string;
  name: string;
  favorite: number;
  share_key: string;
  schema_version: number;
  created_at: number;
  updated_at: number;
}

export interface CreateProjectParams {
  id: string;
  name: string;
  favorite: boolean;
  shareKey: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  yjsState: string;
}

export interface UpdateProjectParams {
  id: string;
  name: string;
  favorite: boolean;
  updatedAt: number;
  yjsState: string;
}

export interface ToggleProjectFavoriteParams {
  id: string;
  favorite: boolean;
  updatedAt: number;
  yjsState: string;
}

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private initPromise: Promise<void> | null = null;

  initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = invoke<void>('db_initialize').catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }
    return this.initPromise;
  }

  async listProjects(): Promise<ProjectRow[]> {
    await this.initialize();
    return invoke<ProjectRow[]>('db_list_projects');
  }

  async getProjectById(projectId: string): Promise<ProjectRow | null> {
    await this.initialize();
    return invoke<ProjectRow | null>('db_get_project_by_id', { projectId });
  }

  async getProjectState(projectId: string): Promise<string | null> {
    await this.initialize();
    return invoke<string | null>('db_get_project_state', { projectId });
  }

  async createProject(params: CreateProjectParams): Promise<void> {
    await this.initialize();
    return invoke<void>('db_create_project', { params });
  }

  async updateProject(params: UpdateProjectParams): Promise<void> {
    await this.initialize();
    return invoke<void>('db_update_project', { params });
  }

  async toggleProjectFavorite(params: ToggleProjectFavoriteParams): Promise<void> {
    await this.initialize();
    return invoke<void>('db_toggle_project_favorite', { params });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.initialize();
    return invoke<void>('db_delete_project', { projectId });
  }
}
