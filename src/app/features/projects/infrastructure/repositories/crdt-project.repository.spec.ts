import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';

import { CrdtProjectRepository } from './crdt-project.repository';
import { DatabaseService } from '@core/persistence/database.service';
import { Project } from '@features/projects/domain/entities/project.entity';
import { ProjectName } from '@features/projects/domain/value-objects/project-name.value-object';
import { bytesToBase64 } from '@core/persistence/bytes.util';
import { YProjectDocument } from '@features/projects/infrastructure/crdt/y-project-document';

function validProjectName(value: string): ProjectName {
  const result = ProjectName.tryCreate(value);
  if (!result.success) {
    throw new Error('Invalid test project name');
  }

  return result.value;
}

describe('CrdtProjectRepository', () => {
  let repository: CrdtProjectRepository;
  let executeMock: ReturnType<typeof vi.fn>;
  let selectMock: ReturnType<typeof vi.fn>;
  const storedStates = new Map<string, string>();

  beforeEach(() => {
    storedStates.clear();
    executeMock = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO project_state')) {
        storedStates.set(String(params[0]), String(params[1]));
      }
      if (sql.includes('ON CONFLICT(project_id)')) {
        storedStates.set(String(params[0]), String(params[1]));
      }
      if (sql.startsWith('DELETE FROM projects')) {
        storedStates.delete(String(params[0]));
      }
    });
    selectMock = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM projects WHERE id')) {
        const id = String(params[0]);
        if (id === 'missing') {
          return [];
        }
        return [{
          id,
          name: 'Stored Project',
          favorite: 0,
          share_key: 'key',
          schema_version: 1,
          created_at: 1,
          updated_at: 1,
        }];
      }
      if (sql.includes('FROM projects ORDER BY')) {
        return [{
          id: 'p1',
          name: 'Alpha',
          favorite: 1,
          share_key: 'key',
          schema_version: 1,
          created_at: 1,
          updated_at: 1,
        }];
      }
      if (sql.includes('FROM project_state')) {
        const id = String(params[0]);
        const state = storedStates.get(id);
        if (!state) {
          return [];
        }
        return [{ yjs_state: state }];
      }
      return [];
    });

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CrdtProjectRepository,
        {
          provide: DatabaseService,
          useValue: {
            execute: executeMock,
            select: selectMock,
          },
        },
      ],
    });

    repository = TestBed.inject(CrdtProjectRepository);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('create persists project metadata and yjs state', async () => {
    const project = Project.create(validProjectName('New Project'), false, 'proj-1');

    const saved = await firstValueFrom(repository.create(project));

    expect(saved.id).toBe('proj-1');
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO projects'),
      expect.arrayContaining(['proj-1', 'New Project', 0]),
    );
    expect(storedStates.has('proj-1')).toBe(true);
  });

  it('getAll returns summaries with pendingCount 0', async () => {
    const summaries = await firstValueFrom(repository.getAll());

    expect(summaries).toHaveLength(1);
    expect(summaries[0].project.name.value).toBe('Alpha');
    expect(summaries[0].pendingCount).toBe(0);
  });

  it('findById returns empty sections and tasks for this phase', async () => {
    const yDoc = YProjectDocument.create('Stored Project', false);
    storedStates.set('p2', bytesToBase64(yDoc.encodeState()));
    selectMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM projects WHERE id')) {
        return [{
          id: String(params[0]),
          name: 'Stored Project',
          favorite: 0,
          share_key: 'key',
          schema_version: 1,
          created_at: 1,
          updated_at: 1,
        }];
      }
      if (sql.includes('FROM project_state')) {
        return [{ yjs_state: storedStates.get(String(params[0])) }];
      }
      return [];
    });

    const aggregate = await firstValueFrom(repository.findById('p2'));

    expect(aggregate.project.name.value).toBe('Stored Project');
    expect(aggregate.sections).toEqual([]);
    expect(aggregate.tasks).toEqual([]);
  });

  it('delete removes project row', async () => {
    await firstValueFrom(repository.delete('proj-1'));

    expect(executeMock).toHaveBeenCalledWith(
      'DELETE FROM projects WHERE id = $1',
      ['proj-1'],
    );
  });

  it('toggleFavorite updates favorite flag in metadata and state', async () => {
    const yDoc = YProjectDocument.create('Stored Project', false);
    storedStates.set('p3', bytesToBase64(yDoc.encodeState()));

    await firstValueFrom(repository.toggleFavorite('p3', true));

    expect(executeMock).toHaveBeenCalledWith(
      'UPDATE projects SET favorite = $1, updated_at = $2 WHERE id = $3',
      [1, expect.any(Number), 'p3'],
    );
    const updated = YProjectDocument.load(
      Uint8Array.from(atob(storedStates.get('p3') ?? ''), (c) => c.charCodeAt(0)),
    );
    expect(updated.getMeta().favorite).toBe(true);
  });
});
