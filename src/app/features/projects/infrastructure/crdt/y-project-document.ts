import * as Y from 'yjs';

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
    wrapper.setMeta({ name, favorite, schemaVersion: PROJECT_SCHEMA_VERSION });
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

  setMeta(meta: Partial<ProjectMeta>): void {
    const map = this.doc.getMap('meta');
    if (meta.name !== undefined) {
      map.set('name', meta.name);
    }
    if (meta.favorite !== undefined) {
      map.set('favorite', meta.favorite);
    }
    if (meta.schemaVersion !== undefined) {
      map.set('schemaVersion', meta.schemaVersion);
    }
  }
}
