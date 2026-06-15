import { Injectable, inject } from '@angular/core';
import { defer, Observable } from 'rxjs';
import { DatabaseService } from '@core/persistence/database.service';
import { base64ToBytes, bytesToBase64 } from '@core/persistence/bytes.util';
import { Section } from '@features/projects/domain/entities/section.entity';
import { SectionRepository } from '@features/projects/domain/repositories/section.repository';
import { YProjectDocument } from '@features/projects/infrastructure/crdt/y-project-document';

@Injectable()
export class CrdtSectionRepository extends SectionRepository {
  private readonly database = inject(DatabaseService);

  create(section: Section): Observable<Section> {
    return defer(() => this.createSection(section));
  }

  update(section: Section): Observable<Section> {
    return defer(() => this.updateSection(section));
  }

  delete(projectId: string, sectionId: string): Observable<void> {
    return defer(() => this.deleteSection(projectId, sectionId));
  }

  findById(projectId: string, sectionId: string): Observable<Section> {
    return defer(() => this.findSectionById(projectId, sectionId));
  }

  private async createSection(section: Section): Promise<Section> {
    const yDoc = await this.loadProjectDocument(section.projectId);
    yDoc.createSection(section);
    await this.persistProjectState(section.projectId, yDoc);
    return section;
  }

  private async updateSection(section: Section): Promise<Section> {
    const yDoc = await this.loadProjectDocument(section.projectId);
    yDoc.updateSection(section.id, section.name);
    await this.persistProjectState(section.projectId, yDoc);
    return section;
  }

  private async deleteSection(projectId: string, sectionId: string): Promise<void> {
    const yDoc = await this.loadProjectDocument(projectId);
    yDoc.deleteSection(sectionId);
    await this.persistProjectState(projectId, yDoc);
  }

  private async findSectionById(projectId: string, sectionId: string): Promise<Section> {
    const yDoc = await this.loadProjectDocument(projectId);
    const section = yDoc.getSections(projectId).find((candidate) => candidate.id === sectionId);

    if (!section) {
      throw new Error(`Section not found: ${sectionId} in project ${projectId}`);
    }

    return section;
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
