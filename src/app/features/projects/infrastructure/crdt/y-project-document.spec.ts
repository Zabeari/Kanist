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
});
