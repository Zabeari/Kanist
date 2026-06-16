import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';

import { CrdtTaskRepository } from './crdt-task.repository';
import { DatabaseService } from '@core/persistence/database.service';
import { Section } from '@features/projects/domain/entities/section.entity';
import { Task } from '@features/projects/domain/entities/task.entity';
import { bytesToBase64 } from '@core/persistence/bytes.util';
import { YProjectDocument } from '@features/projects/infrastructure/crdt/y-project-document';

describe('CrdtTaskRepository', () => {
  let repository: CrdtTaskRepository;
  let getProjectStateMock: ReturnType<typeof vi.fn>;
  let updateProjectStateMock: ReturnType<typeof vi.fn>;
  const storedStates = new Map<string, string>();
  const projectId = 'proj-1';
  const sectionId = 'sec-1';
  const startDate = new Date('2025-01-15T00:00:00.000Z');

  function loadStoredDoc(): YProjectDocument {
    return YProjectDocument.load(
      Uint8Array.from(atob(storedStates.get(projectId) ?? ''), (c) => c.charCodeAt(0)),
    );
  }

  beforeEach(() => {
    storedStates.clear();
    const initialDoc = YProjectDocument.create('Project', false);
    initialDoc.createSection(Section.create('Backlog', projectId, sectionId));
    storedStates.set(projectId, bytesToBase64(initialDoc.encodeState()));

    getProjectStateMock = vi.fn(async (id: string) => storedStates.get(id) ?? null);
    updateProjectStateMock = vi.fn(async (id: string, yjsState: string) => {
      storedStates.set(id, yjsState);
    });

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CrdtTaskRepository,
        {
          provide: DatabaseService,
          useValue: {
            getProjectState: getProjectStateMock,
            updateProjectState: updateProjectStateMock,
          },
        },
      ],
    });

    repository = TestBed.inject(CrdtTaskRepository);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('create persists task in yjs state', async () => {
    const task = Task.create('Task A', sectionId, startDate, 'task-1');

    const saved = await firstValueFrom(repository.create(projectId, task));

    expect(saved).toEqual(task);
    expect(updateProjectStateMock).toHaveBeenCalledWith(projectId, expect.any(String));
    expect(loadStoredDoc().findTask('task-1')?.name).toBe('Task A');
    expect(loadStoredDoc().getSections(projectId)[0].taskIds).toEqual(['task-1']);
  });

  it('update changes task fields in yjs state', async () => {
    const task = Task.create('Task A', sectionId, startDate, 'task-1');
    await firstValueFrom(repository.create(projectId, task));

    const updated = task
      .updateName('Renamed')
      .updateDescription('Details')
      .setLabel('urgent');
    const saved = await firstValueFrom(repository.update(projectId, updated));

    expect(saved.name).toBe('Renamed');
    expect(loadStoredDoc().findTask('task-1')?.description).toBe('Details');
    expect(loadStoredDoc().findTask('task-1')?.label).toBe('urgent');
  });

  it('complete marks task completed in yjs state', async () => {
    const task = Task.create('Task A', sectionId, startDate, 'task-1');
    await firstValueFrom(repository.create(projectId, task));

    const saved = await firstValueFrom(
      repository.complete(projectId, sectionId, 'task-1', '2025-03-01'),
    );

    expect(saved.completed).toBe(true);
    expect(saved.completedDate).toBeInstanceOf(Date);
    expect(loadStoredDoc().findTask('task-1')?.completed).toBe(true);
  });

  it('uncomplete marks task incomplete in yjs state', async () => {
    const task = Task.create('Task A', sectionId, startDate, 'task-1').complete();
    await firstValueFrom(repository.create(projectId, task));

    const saved = await firstValueFrom(repository.uncomplete(projectId, sectionId, 'task-1'));

    expect(saved.completed).toBe(false);
    expect(saved.completedDate).toBeUndefined();
    expect(loadStoredDoc().findTask('task-1')?.completed).toBe(false);
  });

  it('delete removes task from yjs state', async () => {
    const task = Task.create('Task A', sectionId, startDate, 'task-1');
    await firstValueFrom(repository.create(projectId, task));

    await firstValueFrom(repository.delete(projectId, sectionId, 'task-1'));

    expect(loadStoredDoc().findTask('task-1')).toBeUndefined();
    expect(loadStoredDoc().getSections(projectId)[0].taskIds).toEqual([]);
  });

  it('findById returns a single task', async () => {
    const task = Task.create('Task A', sectionId, startDate, 'task-1');
    await firstValueFrom(repository.create(projectId, task));

    const found = await firstValueFrom(repository.findById(projectId, sectionId, 'task-1'));

    expect(found).toEqual(task);
  });

  it('findById throws when task does not exist', async () => {
    await expect(firstValueFrom(repository.findById(projectId, sectionId, 'missing'))).rejects.toThrow(
      /Task not found/,
    );
  });
});
