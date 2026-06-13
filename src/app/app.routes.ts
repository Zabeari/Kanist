import { Routes } from '@angular/router';
import { HomeComponent } from '@features/projects/presentation/components/home/home.component';

export const routes: Routes = [
  { path: 'projects/upcoming', component: HomeComponent },
  { path: 'projects/today', component: HomeComponent },
  { path: 'projects/:id', component: HomeComponent },
  { path: '**', redirectTo: 'projects/upcoming' },
];
