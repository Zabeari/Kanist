import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';

import { CrdtSectionRepository } from './crdt-section.repository';
import { DatabaseService } from '@core/persistence/database.service';
import { Section } from '@features/projects/domain/entities/section.entity';
import { bytesToBase64 } from '@core/persistence/bytes.util';
import { YProjectDocument } from '@features/projects/infrastructure/crdt/y-project-document';

describe('CrdtSectionRepository', () => {
  let repository: CrdtSectionRepository;
  let getProjectStateMock: ReturnType<typeof vi.fn>;
  let updateProjectStateMock: ReturnType<typeof vi.fn>;
  const storedStates = new Map<string, string>();

  beforeEach(() => {
    storedStates.clear();
    const initialDoc = YProjectDocument.create('Project', false);
    storedStates.set('proj-1', bytesToBase64(initialDoc.encodeState()));

    getProjectStateMock = vi.fn(async (projectId: string) => storedStates.get(projectId) ?? null);
    updateProjectStateMock = vi.fn(async (projectId: string, yjsState: string) => {
      storedStates.set(projectId, yjsState);
    });

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CrdtSectionRepository,
        {
          provide: DatabaseService,
          useValue: {
            getProjectState: getProjectStateMock,
            updateProjectState: updateProjectStateMock,
          },
        },
      ],
    });

    repository = TestBed.inject(CrdtSectionRepository);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('create persists section in yjs state', async () => {
    const section = Section.create('Backlog', 'proj-1', 'sec-1');

    const saved = await firstValueFrom(repository.create(section));

    expect(saved).toEqual(section);
    expect(updateProjectStateMock).toHaveBeenCalledWith('proj-1', expect.any(String));

    const loaded = YProjectDocument.load(
      Uint8Array.from(atob(storedStates.get('proj-1') ?? ''), (c) => c.charCodeAt(0)),
    );
    expect(loaded.getSectionOrder()).toEqual(['sec-1']);
    expect(loaded.getSections('proj-1')[0].name).toBe('Backlog');
  });

  it('update changes section name in yjs state', async () => {
    const section = Section.create('Backlog', 'proj-1', 'sec-1');
    await firstValueFrom(repository.create(section));

    const updated = section.updateName('In Progress');
    const saved = await firstValueFrom(repository.update(updated));

    expect(saved.name).toBe('In Progress');

    const loaded = YProjectDocument.load(
      Uint8Array.from(atob(storedStates.get('proj-1') ?? ''), (c) => c.charCodeAt(0)),
    );
    expect(loaded.getSections('proj-1')[0].name).toBe('In Progress');
  });

  it('delete removes section from yjs state', async () => {
    const section = Section.create('Backlog', 'proj-1', 'sec-1');
    await firstValueFrom(repository.create(section));

    await firstValueFrom(repository.delete('proj-1', 'sec-1'));

    const loaded = YProjectDocument.load(
      Uint8Array.from(atob(storedStates.get('proj-1') ?? ''), (c) => c.charCodeAt(0)),
    );
    expect(loaded.getSectionOrder()).toEqual([]);
    expect(loaded.getSections('proj-1')).toEqual([]);
  });

  it('findById returns a single section', async () => {
    const section = Section.create('Backlog', 'proj-1', 'sec-1');
    await firstValueFrom(repository.create(section));

    const found = await firstValueFrom(repository.findById('proj-1', 'sec-1'));

    expect(found).toEqual(section);
  });

  it('findById throws when section does not exist', async () => {
    await expect(firstValueFrom(repository.findById('proj-1', 'missing'))).rejects.toThrow(
      /Section not found/,
    );
  });
});
