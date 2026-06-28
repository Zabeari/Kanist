---
title: Local-First Migration — Progress & Next Steps
status: living
phase: implement
version: 0.2.0
date: 2026-06-16
app: Kanist Desktop (Tauri 2 + Angular 20)
parent_spec: docs/specs/local-first-sync.spec.md
tags: [local-first, crdt, yjs, progress, roadmap]
---

# Local-First Migration — Progress & Next Steps

> **Living document.** Tracks implementation status against
> [`local-first-sync.spec.md`](./local-first-sync.spec.md). Update this file when
> epics complete or priorities shift.

---

## 1. Objective

Migrate Kanist Desktop from HTTP REST repositories to **local-first CRDT storage**
(Yjs + SQLite), then add collaborative sync (relay + E2EE). This spec answers:
*where are we*, *what works*, *what is broken*, and *what comes next*.

---

## 2. Current Architecture

```
Angular UI (stores / use cases)
  → CrdtProjectRepository | CrdtSectionRepository | CrdtTaskRepository
    → load Yjs blob from SQLite (Tauri db_get_project_state)
    → mutate YProjectDocument in memory
    → persist blob (Tauri db_update_project_state)
```

- **Source of truth:** one `Y.Doc` per project (`YProjectDocument` wrapper).
- **Persistence:** SQLite `project_state.yjs_state` (base64 blob) via `DatabaseService`.
- **DI:** all three project-feature repositories bound to CRDT implementations in
  `projects.providers.ts`.
- **Legacy:** HTTP repositories remain in the codebase for reference/tests but are
  not wired in production DI.

---

## 3. Epic Status

| Epic | Description | Status |
|------|-------------|--------|
| **A** | Foundations (deps, SQLite, Tauri commands, crypto stub) | ✅ Done |
| **B1** | `YProjectDocument` schema + CRUD accessors | ✅ Done |
| **B2** | Projection layer (stores fed from CRDT on load) | ⚠️ Partial — stores still optimistic; no `observeDeep` re-projection |
| **B3** | `Crdt*Repository` ports | ✅ Done (project, section, task) |
| **B4** | Shared in-memory doc + debounced persist | ❌ Not started |
| **C** | Sharing & sync (relay, E2EE, deep links) | ❌ Not started |
| **D** | Decommission HTTP / auth server stack | ❌ Not started |
| **E** | Hardening, perf, docs | ❌ Not started |

---

## 4. What Works Today

### Projects
- Create, read, update, delete, toggle favorite
- List all projects from SQLite
- Load project with sections and tasks from Yjs doc

### Sections
- Create, update, delete within a project
- Section order preserved in CRDT

### Tasks
- Create, update, complete/uncomplete, delete, find by id
- Root tasks linked via section `taskOrder`
- Subtasks linked via parent `subtaskOrder` (when `parentTaskId` is set on create)
- Cascade delete removes subtask subtree
- Section scoping validated on complete/uncomplete/delete/find
- Date fields validated on CRDT read/write paths

### Quality
- CI green: build, lint, 329+ unit tests (`act -W .github/workflows/ci.yml -j build-and-test`)

---

## 5. Known Gaps & Limitations

| # | Gap | Impact | Planned fix |
|---|-----|--------|-------------|
| G1 | Load-modify-persist per repo call (no shared in-memory doc) | Concurrent writes can race; extra I/O | Epic **B4** |
| G2 | No optimistic concurrency / CAS on blob writes | Last write wins silently | Epic **B4** |
| G3 | Stores are optimistic projections, not live CRDT observers | UI can drift from persisted state until reload | Epic **B2** completion |
| G4 | Subtask create was UI-only (fixed 2026-06-16) | Subtasks lost on reload | ✅ Use case + task menu wired end-to-end |
| G5 | No nested-subtask validation | CRDT allows subtask-of-subtask; UI assumes one level | Optional guard in use case or YDoc |
| G6 | No sync / sharing / deep links | Single-device only | Epic **C** |
| G7 | HTTP repos and auth stack still present | Dead code noise | Epic **D** |

---

## 6. Next Steps (ordered)

### Immediate (Epic B completion)

1. **B4 — Shared document lifecycle**
   - Hold one `YProjectDocument` per open project in a service (not per repo call).
   - Debounced persist to SQLite (e.g. 300–500 ms trailing).
   - Rehydrate on app startup / project open.
   - *Acceptance:* two rapid task edits produce one merged blob; no lost updates within a single session.

2. **B2 — Live projection (optional follow-up to B4)**
   - `observeDeep` on open doc → rebuild store view models.
   - *Acceptance:* external blob changes (simulated) reflect in UI without manual reload.

### Medium term (Epic C)

3. **C1** — Relay server (separate repo, containerized).
4. **C2** — `RelayClient` in desktop app.
5. **C3/C4** — Share + join flows (`kanist://` deep links).
6. **C5** — Coarse presence via Yjs awareness.

### Later (Epic D + E)

7. Remove HTTP repositories, auth server flow, SSE infra.
8. Local identity onboarding (display name + color).
9. Performance pass (NFR1–NFR4, 1,000-task fixture).
10. Update `README.md`, `ARCHITECTURE.md`, `docs/local-development.md`.

---

## 7. Subtask Persistence Fix (2026-06-16)

### Problem
`TaskStore.createSubtask` called `CreateTaskUseCase` without `parentTaskId`, then
patched the parent link only in the in-memory store. CRDT `createTask` never received
the parent reference, so subtasks did not survive reload.

### Solution
Extended `CreateTaskUseCase.execute(..., parentTaskId?)` and pass it from
`TaskStore.createSubtask`. Subtasks are created from the **task details modal**
(checklist + inline add field); the list row menu no longer has a separate add flow.

### Acceptance criteria
```gherkin
Given a project with a parent task in section S
When the user creates a subtask under that parent
Then the subtask is persisted with parentTaskId set
And the parent's subtaskOrder contains the subtask id
And the subtask does not appear in section taskOrder
And after reload the parent-child relationship is intact
```

---

## 8. Commands

```bash
# Dev
bun run start              # tauri dev

# Quality gate (required before marking work complete)
bun run build
bun run lint
bun run test
act -W .github/workflows/ci.yml -j build-and-test
```

---

## 9. Boundaries

### Always
- Run CI before reporting a task complete (`AGENTS.md`).
- Keep CRDT schema aligned with `local-first-sync.spec.md` §3.3.
- Mutate via repository ports / use cases, not direct Yjs access from components.

### Ask first
- SQLite schema changes
- New npm/cargo dependencies
- Relay protocol or encryption changes

### Never
- Store authoritative business logic on the relay
- Bypass section scoping on task mutations
- Remove failing tests without explicit approval

---

## 10. Open Questions

| # | Question | Default assumption |
|---|----------|-------------------|
| Q1 | Enforce one-level subtasks only? | Defer; CRDT allows nesting, UI shows one level |
| Q2 | Repair orphaned subtasks from pre-fix sessions? | No migration; clean slate per parent spec |
| Q3 | B4 service location (`ProjectDocumentService` vs extend repos)? | Decide at B4 kickoff |

---

## 11. Approval

- [x] Subtask persistence fix — approved via conversation (2026-06-16).
- [ ] B4 shared doc lifecycle — pending kickoff approval.
- [ ] Epic C sync — pending B4 completion.
