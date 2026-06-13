import { ApplicationConfig, inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { PROJECT_FEATURE_PROVIDERS } from '@features/projects/projects.providers';
import { baseUrlInterceptor } from '@shared/interceptors/base-url.interceptor';
import { TODAY_FEATURE_PROVIDERS } from '@features/today/today.providers';
import { UPCOMING_FEATURE_PROVIDERS } from '@features/upcoming/upcoming.providers';
import { DatabaseService } from '@core/persistence/database.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(
      withInterceptors([
        baseUrlInterceptor,
      ])
    ),
    provideAppInitializer(() => {
      const database = inject(DatabaseService);
      return database.initialize();
    }),
    ...PROJECT_FEATURE_PROVIDERS,
    ...TODAY_FEATURE_PROVIDERS,
    ...UPCOMING_FEATURE_PROVIDERS,
  ],
};
