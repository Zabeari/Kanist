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
      this.initPromise = invoke<void>('db_initialize');
    }
    return this.initPromise;
  }

  listProjects(): Promise<ProjectRow[]> {
    return invoke<ProjectRow[]>('db_list_projects');
  }

  getProjectState(projectId: string): Promise<string | null> {
    return invoke<string | null>('db_get_project_state', { projectId });
  }

  createProject(params: CreateProjectParams): Promise<void> {
    return invoke<void>('db_create_project', { params });
  }

  updateProject(params: UpdateProjectParams): Promise<void> {
    return invoke<void>('db_update_project', { params });
  }

  toggleProjectFavorite(params: ToggleProjectFavoriteParams): Promise<void> {
    return invoke<void>('db_toggle_project_favorite', { params });
  }

  deleteProject(projectId: string): Promise<void> {
    return invoke<void>('db_delete_project', { projectId });
  }
}
