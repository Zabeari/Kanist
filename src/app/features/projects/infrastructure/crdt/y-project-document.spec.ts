import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { PROJECT_SCHEMA_VERSION, YProjectDocument } from './y-project-document';

describe('YProjectDocument', () => {
  it('create initializes meta map with schema version', () => {
    const doc = YProjectDocument.create('My Project', true);

    expect(doc.getMeta()).toEqual({
      name: 'My Project',
      favorite: true,
      schemaVersion: PROJECT_SCHEMA_VERSION,
    });
  });

  it('load restores meta from encoded state', () => {
    const original = YProjectDocument.create('Persisted', false);
    const state = original.encodeState();

    const loaded = YProjectDocument.load(state);

    expect(loaded.getMeta()).toEqual({
      name: 'Persisted',
      favorite: false,
      schemaVersion: PROJECT_SCHEMA_VERSION,
    });
  });

  it('setMeta updates individual fields', () => {
    const doc = YProjectDocument.create('Initial', false);

    doc.setMeta({ name: 'Renamed', favorite: true });

    expect(doc.getMeta()).toEqual({
      name: 'Renamed',
      favorite: true,
      schemaVersion: PROJECT_SCHEMA_VERSION,
    });
  });

  it('getMeta throws when a required field is missing', () => {
    const doc = new Y.Doc();
    doc.getMap('meta').set('name', 'Incomplete');
    const loaded = YProjectDocument.load(Y.encodeStateAsUpdate(doc));

    expect(() => loaded.getMeta()).toThrow(/meta\.favorite is missing/);
  });

  it('getMeta throws when a field has the wrong type', () => {
    const doc = new Y.Doc();
    const meta = doc.getMap('meta');
    meta.set('name', 123);
    meta.set('favorite', false);
    meta.set('schemaVersion', PROJECT_SCHEMA_VERSION);
    const loaded = YProjectDocument.load(Y.encodeStateAsUpdate(doc));

    expect(() => loaded.getMeta()).toThrow(/meta\.name must be a string/);
  });
});
