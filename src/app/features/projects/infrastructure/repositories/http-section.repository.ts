import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Section } from '@features/projects/domain/entities/section.entity';
import { SectionRepository } from '@features/projects/domain/repositories/section.repository';
import { SectionDto } from '@features/projects/infrastructure/dto/section.dto';
import { SectionMapper } from '@features/projects/infrastructure/mappers/section.mapper';
@Injectable()
export class HttpSectionRepository extends SectionRepository {
  private http = inject(HttpClient);


  create(section: Section): Observable<Section> {
    const dto = SectionMapper.toCreateDto(section);
    return this.http
      .post<SectionDto>(`/projects/${section.projectId}/section/create`, dto)
      .pipe(map(responseDto => SectionMapper.toDomain(responseDto, section.projectId)));
  }

  update(section: Section): Observable<Section> {
    const dto = SectionMapper.toDto(section);
    return this.http
      .put<SectionDto>(`/projects/${section.projectId}/section/${section.id}/update`, dto)
      .pipe(map(responseDto => SectionMapper.toDomain(responseDto, section.projectId)));
  }

  delete(projectId: string, sectionId: string): Observable<void> {
    return this.http.delete<void>(`/projects/${projectId}/section/${sectionId}/delete`);
  }

  findById(projectId: string, sectionId: string): Observable<Section> {
    return this.http
      .get<SectionDto>(`/projects/${projectId}/section/${sectionId}/get`)
      .pipe(map(dto => SectionMapper.toDomain(dto, projectId)));
  }
}
