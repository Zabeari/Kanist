import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { Section } from '@features/projects/domain/entities/section.entity';
import { Task } from '@features/projects/domain/entities/task.entity';
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

  describe('tasks', () => {
    const projectId = 'proj-1';
    const sectionId = 'sec-1';
    const startDate = new Date('2025-01-15T00:00:00.000Z');

    function createDocWithSection(): YProjectDocument {
      const doc = YProjectDocument.create('Project', false);
      doc.createSection(Section.create('Backlog', projectId, sectionId));
      return doc;
    }

    it('createTask adds task to tasks map and section taskOrder', () => {
      const doc = createDocWithSection();
      const task = Task.create('Task A', sectionId, startDate, 'task-1');

      doc.createTask(task);

      expect(doc.findTask('task-1')).toEqual(task);
      expect(doc.getTasks()).toEqual([task]);
      expect(doc.getSections(projectId)[0].taskIds).toEqual(['task-1']);
    });

    it('updateTask changes task fields', () => {
      const doc = createDocWithSection();
      const task = Task.create('Task A', sectionId, startDate, 'task-1');
      doc.createTask(task);

      const updated = task
        .updateName('Renamed')
        .updateDescription('Details')
        .setLabel('urgent')
        .setEndDate(new Date('2025-02-01T00:00:00.000Z'));
      doc.updateTask(updated);

      expect(doc.findTask('task-1')?.name).toBe('Renamed');
      expect(doc.findTask('task-1')?.description).toBe('Details');
      expect(doc.findTask('task-1')?.label).toBe('urgent');
      expect(doc.findTask('task-1')?.endDate?.toISOString()).toBe('2025-02-01T00:00:00.000Z');
    });

    it('completeTask and uncompleteTask toggle completion state', () => {
      const doc = createDocWithSection();
      const task = Task.create('Task A', sectionId, startDate, 'task-1');
      doc.createTask(task);
      const completedDate = new Date('2025-03-01T12:00:00.000Z');

      doc.completeTask('task-1', completedDate);
      expect(doc.findTask('task-1')?.completed).toBe(true);
      expect(doc.findTask('task-1')?.completedDate?.toISOString()).toBe(completedDate.toISOString());

      doc.uncompleteTask('task-1');
      expect(doc.findTask('task-1')?.completed).toBe(false);
      expect(doc.findTask('task-1')?.completedDate).toBeUndefined();
    });

    it('deleteTask removes task from tasks map and section taskOrder', () => {
      const doc = createDocWithSection();
      doc.createTask(Task.create('Task A', sectionId, startDate, 'task-1'));

      doc.deleteTask('task-1');

      expect(doc.findTask('task-1')).toBeUndefined();
      expect(doc.getTasks()).toEqual([]);
      expect(doc.getSections(projectId)[0].taskIds).toEqual([]);
    });

    it('createTask links subtasks via parent subtaskOrder', () => {
      const doc = createDocWithSection();
      const parent = Task.create('Parent', sectionId, startDate, 'task-parent');
      const subtask = Task.create('Subtask', sectionId, startDate, 'task-sub', 'task-parent');
      doc.createTask(parent);
      doc.createTask(subtask);

      expect(doc.findTask('task-parent')?.subtaskIds).toEqual(['task-sub']);
      expect(doc.findTask('task-sub')?.parentTaskId).toBe('task-parent');
      expect(doc.getSections(projectId)[0].taskIds).toEqual(['task-parent']);
    });

    it('deleteTask removes subtask from parent subtaskOrder', () => {
      const doc = createDocWithSection();
      doc.createTask(Task.create('Parent', sectionId, startDate, 'task-parent'));
      doc.createTask(Task.create('Subtask', sectionId, startDate, 'task-sub', 'task-parent'));

      doc.deleteTask('task-sub');

      expect(doc.findTask('task-sub')).toBeUndefined();
      expect(doc.findTask('task-parent')?.subtaskIds).toEqual([]);
    });

    it('persists tasks through encode/load round-trip', () => {
      const original = createDocWithSection();
      original.createTask(Task.create('Task A', sectionId, startDate, 'task-1'));

      const loaded = YProjectDocument.load(original.encodeState());

      expect(loaded.findTask('task-1')?.name).toBe('Task A');
      expect(loaded.getSections(projectId)[0].taskIds).toEqual(['task-1']);
    });

    it('createTask throws when task id already exists', () => {
      const doc = createDocWithSection();
      doc.createTask(Task.create('Task A', sectionId, startDate, 'task-1'));

      expect(() => doc.createTask(Task.create('Duplicate', sectionId, startDate, 'task-1'))).toThrow(
        /already exists/,
      );
    });

    it('getTasks throws when required task field has wrong type', () => {
      const doc = createDocWithSection();
      doc.createTask(Task.create('Task A', sectionId, startDate, 'task-1'));
      const yDoc = new Y.Doc();
      Y.applyUpdate(yDoc, doc.encodeState());
      const taskMap = yDoc.getMap('tasks').get('task-1') as Y.Map<unknown>;
      taskMap.set('name', 123);

      const corrupted = YProjectDocument.load(Y.encodeStateAsUpdate(yDoc));

      expect(() => corrupted.getTasks()).toThrow(/task "task-1" name must be a string/);
    });
  });
});
