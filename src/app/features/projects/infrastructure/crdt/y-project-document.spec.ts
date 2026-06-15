import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { Section } from '@features/projects/domain/entities/section.entity';
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

  it('setMeta does not change schemaVersion', () => {
    const doc = YProjectDocument.create('Stable', false);

    doc.setMeta({ name: 'Renamed', favorite: true });

    expect(doc.getMeta().schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
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

  describe('sections', () => {
    const projectId = 'proj-1';

    it('createSection adds section to sectionOrder and sections map', () => {
      const doc = YProjectDocument.create('Project', false);
      const section = Section.create('Backlog', projectId, 'sec-1');

      doc.createSection(section);

      expect(doc.getSectionOrder()).toEqual(['sec-1']);
      expect(doc.getSections(projectId)).toEqual([section]);
    });

    it('updateSection changes section name', () => {
      const doc = YProjectDocument.create('Project', false);
      const section = Section.create('Backlog', projectId, 'sec-1');
      doc.createSection(section);

      doc.updateSection('sec-1', 'In Progress');

      expect(doc.getSections(projectId)[0].name).toBe('In Progress');
    });

    it('deleteSection removes section from order and map', () => {
      const doc = YProjectDocument.create('Project', false);
      doc.createSection(Section.create('Backlog', projectId, 'sec-1'));
      doc.createSection(Section.create('Done', projectId, 'sec-2'));

      doc.deleteSection('sec-1');

      expect(doc.getSectionOrder()).toEqual(['sec-2']);
      expect(doc.getSections(projectId)).toHaveLength(1);
      expect(doc.getSections(projectId)[0].id).toBe('sec-2');
    });

    it('persists sections through encode/load round-trip', () => {
      const original = YProjectDocument.create('Project', false);
      original.createSection(Section.create('Backlog', projectId, 'sec-1'));

      const loaded = YProjectDocument.load(original.encodeState());

      expect(loaded.getSectionOrder()).toEqual(['sec-1']);
      expect(loaded.getSections(projectId)[0].name).toBe('Backlog');
    });

    it('createSection throws when section id already exists', () => {
      const doc = YProjectDocument.create('Project', false);
      doc.createSection(Section.create('Backlog', projectId, 'sec-1'));

      expect(() => doc.createSection(Section.create('Duplicate', projectId, 'sec-1'))).toThrow(
        /already exists/,
      );
    });

    it('getSections throws when section map entry is missing', () => {
      const doc = YProjectDocument.create('Project', false);
      doc.createSection(Section.create('Backlog', projectId, 'sec-1'));
      const yDoc = new Y.Doc();
      Y.applyUpdate(yDoc, doc.encodeState());
      yDoc.getArray<string>('sectionOrder').push(['sec-missing']);

      const corrupted = YProjectDocument.load(Y.encodeStateAsUpdate(yDoc));

      expect(() => corrupted.getSections(projectId)).toThrow(/sec-missing/);
    });

    it('getSections throws when taskOrder contains non-string entries', () => {
      const doc = YProjectDocument.create('Project', false);
      doc.createSection(Section.create('Backlog', projectId, 'sec-1'));
      const yDoc = new Y.Doc();
      Y.applyUpdate(yDoc, doc.encodeState());
      const sectionMap = yDoc.getMap('sections').get('sec-1') as Y.Map<unknown>;
      const taskOrder = sectionMap.get('taskOrder') as Y.Array<unknown>;
      taskOrder.push([123]);

      const corrupted = YProjectDocument.load(Y.encodeStateAsUpdate(yDoc));

      expect(() => corrupted.getSections(projectId)).toThrow(/taskOrder\[0\] must be a string/);
    });
  });
});
