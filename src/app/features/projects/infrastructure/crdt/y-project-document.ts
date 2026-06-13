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
    return {
      name: meta.get('name') as string,
      favorite: meta.get('favorite') as boolean,
      schemaVersion: meta.get('schemaVersion') as number,
    };
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
