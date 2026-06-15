import * as Y from 'yjs';
import { Section } from '@features/projects/domain/entities/section.entity';

export const PROJECT_SCHEMA_VERSION = 1;

export interface ProjectMeta {
  name: string;
  favorite: boolean;
  schemaVersion: number;
}

export class YProjectDocument {
  private constructor(private readonly doc: Y.Doc) {}

  static create(name: string, favorite: boolean): YProjectDocument {
    const doc = new Y.Doc();
    const wrapper = new YProjectDocument(doc);
    doc.getMap('meta').set('schemaVersion', PROJECT_SCHEMA_VERSION);
    wrapper.setMeta({ name, favorite });
    return wrapper;
  }

  static load(state: Uint8Array): YProjectDocument {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    return new YProjectDocument(doc);
  }

  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  getMeta(): ProjectMeta {
    const meta = this.doc.getMap('meta');
    const context = `YProjectDocument(doc=${this.doc.guid})`;

    if (!meta.has('name')) {
      throw new Error(`${context}: meta.name is missing`);
    }
    const name = meta.get('name');
    if (typeof name !== 'string') {
      throw new Error(`${context}: meta.name must be a string, got ${typeof name}`);
    }

    if (!meta.has('favorite')) {
      throw new Error(`${context}: meta.favorite is missing`);
    }
    const favorite = meta.get('favorite');
    if (typeof favorite !== 'boolean') {
      throw new Error(`${context}: meta.favorite must be a boolean, got ${typeof favorite}`);
    }

    if (!meta.has('schemaVersion')) {
      throw new Error(`${context}: meta.schemaVersion is missing`);
    }
    const schemaVersion = meta.get('schemaVersion');
    if (typeof schemaVersion !== 'number') {
      throw new Error(`${context}: meta.schemaVersion must be a number, got ${typeof schemaVersion}`);
    }

    return { name, favorite, schemaVersion };
  }

  setMeta(meta: Partial<Pick<ProjectMeta, 'name' | 'favorite'>>): void {
    const map = this.doc.getMap('meta');
    if (meta.name !== undefined) {
      map.set('name', meta.name);
    }
    if (meta.favorite !== undefined) {
      map.set('favorite', meta.favorite);
    }
  }

  getSectionOrder(): string[] {
    const sectionOrder = this.doc.getArray<string>('sectionOrder');
    return sectionOrder.toArray();
  }

  getSections(projectId: string): Section[] {
    const sectionOrder = this.getSectionOrder();
    const sectionsMap = this.doc.getMap('sections');

    return sectionOrder.map((sectionId) => {
      const sectionMap = sectionsMap.get(sectionId);
      if (!(sectionMap instanceof Y.Map)) {
        throw new Error(
          `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" is missing or not a Y.Map`,
        );
      }

      const name = this.readSectionName(sectionId, sectionMap);
      const taskOrder = this.readTaskOrder(sectionId, sectionMap);

      return new Section(sectionId, name, projectId, taskOrder);
    });
  }

  createSection(section: Section): void {
    const sectionOrder = this.doc.getArray<string>('sectionOrder');
    const sectionsMap = this.doc.getMap('sections');

    if (sectionsMap.has(section.id)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${section.id}" already exists`,
      );
    }

    const sectionMap = new Y.Map<unknown>();
    sectionMap.set('name', section.name);
    sectionMap.set('taskOrder', Y.Array.from([...section.taskIds]));

    sectionsMap.set(section.id, sectionMap);
    sectionOrder.push([section.id]);
  }

  updateSection(sectionId: string, name: string): void {
    const sectionMap = this.getSectionMap(sectionId);
    sectionMap.set('name', name);
  }

  deleteSection(sectionId: string): void {
    const sectionOrder = this.doc.getArray<string>('sectionOrder');
    const sectionsMap = this.doc.getMap('sections');

    const index = sectionOrder.toArray().indexOf(sectionId);
    if (index === -1) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" not found in sectionOrder`,
      );
    }

    sectionOrder.delete(index, 1);
    sectionsMap.delete(sectionId);
  }

  private getSectionMap(sectionId: string): Y.Map<unknown> {
    const sectionsMap = this.doc.getMap('sections');
    const sectionMap = sectionsMap.get(sectionId);

    if (!(sectionMap instanceof Y.Map)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" is missing or not a Y.Map`,
      );
    }

    return sectionMap;
  }

  private readSectionName(sectionId: string, sectionMap: Y.Map<unknown>): string {
    if (!sectionMap.has('name')) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" name is missing`,
      );
    }

    const name = sectionMap.get('name');
    if (typeof name !== 'string') {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" name must be a string, got ${typeof name}`,
      );
    }

    return name;
  }

  private readTaskOrder(sectionId: string, sectionMap: Y.Map<unknown>): string[] {
    if (!sectionMap.has('taskOrder')) {
      return [];
    }

    const taskOrder = sectionMap.get('taskOrder');
    if (!(taskOrder instanceof Y.Array)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" taskOrder must be a Y.Array`,
      );
    }

    return taskOrder.toArray();
  }
}
