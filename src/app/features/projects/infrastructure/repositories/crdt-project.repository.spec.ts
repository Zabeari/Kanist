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
  let createProjectMock: ReturnType<typeof vi.fn>;
  let listProjectsMock: ReturnType<typeof vi.fn>;
  let getProjectStateMock: ReturnType<typeof vi.fn>;
  let deleteProjectMock: ReturnType<typeof vi.fn>;
  let toggleProjectFavoriteMock: ReturnType<typeof vi.fn>;
  const storedStates = new Map<string, string>();

  beforeEach(() => {
    storedStates.clear();
    createProjectMock = vi.fn(async (params: { id: string; yjsState: string }) => {
      storedStates.set(params.id, params.yjsState);
    });
    listProjectsMock = vi.fn(async () => [{
      id: 'p1',
      name: 'Alpha',
      favorite: 1,
      share_key: 'key',
      schema_version: 1,
      created_at: 1,
      updated_at: 1,
    }]);
    getProjectStateMock = vi.fn(async (projectId: string) => storedStates.get(projectId) ?? null);
    deleteProjectMock = vi.fn(async (projectId: string) => {
      storedStates.delete(projectId);
    });
    toggleProjectFavoriteMock = vi.fn(async (params: { id: string; yjsState: string }) => {
      storedStates.set(params.id, params.yjsState);
    });

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CrdtProjectRepository,
        {
          provide: DatabaseService,
          useValue: {
            createProject: createProjectMock,
            listProjects: listProjectsMock,
            getProjectState: getProjectStateMock,
            deleteProject: deleteProjectMock,
            toggleProjectFavorite: toggleProjectFavoriteMock,
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
    expect(createProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'proj-1',
        name: 'New Project',
        favorite: false,
      }),
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
    listProjectsMock.mockResolvedValue([{
      id: 'p2',
      name: 'Stored Project',
      favorite: 0,
      share_key: 'key',
      schema_version: 1,
      created_at: 1,
      updated_at: 1,
    }]);

    const aggregate = await firstValueFrom(repository.findById('p2'));

    expect(aggregate.project.name.value).toBe('Stored Project');
    expect(aggregate.sections).toEqual([]);
    expect(aggregate.tasks).toEqual([]);
  });

  it('delete removes project row', async () => {
    await firstValueFrom(repository.delete('proj-1'));

    expect(deleteProjectMock).toHaveBeenCalledWith('proj-1');
  });

  it('toggleFavorite updates favorite flag in metadata and state', async () => {
    const yDoc = YProjectDocument.create('Stored Project', false);
    storedStates.set('p3', bytesToBase64(yDoc.encodeState()));

    await firstValueFrom(repository.toggleFavorite('p3', true));

    expect(toggleProjectFavoriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p3',
        favorite: true,
      }),
    );
    const updated = YProjectDocument.load(
      Uint8Array.from(atob(storedStates.get('p3') ?? ''), (c) => c.charCodeAt(0)),
    );
    expect(updated.getMeta().favorite).toBe(true);
  });
});
