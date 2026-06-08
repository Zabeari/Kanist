import { Injectable } from '@angular/core';
import { environment } from '@shared/config/environment';

export interface ResolvedRuntimeConfig {
  apiBaseUrl: string;
  isBearerAuthEnabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  get apiBaseUrl(): string {
    return environment.apiBaseUrl;
  }

  isBearerAuthEnabled(): boolean {
    return environment.production;
  }

  /** Reserved for future Tauri-side config loading. */
  async load(): Promise<void> {
    return;
  }
}
