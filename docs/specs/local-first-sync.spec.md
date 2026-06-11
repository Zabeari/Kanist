---
title: Local-First Collaborative Sync (CRDT + E2EE Relay)
status: approved
phase: implement
version: 0.1.0
date: 2026-06-11
app: Kanist Desktop (Tauri 2 + Angular 20)
authors:
  - spec-gathering architect (pending human approval)
supersedes:
  - HTTP repositories (client-server REST)
  - Server-Sent Events live updates
  - Server-side authentication / accounts
decisions:
  relay_persistence: disk-snapshot (encrypted append-log + snapshot cache, non-authoritative)
  transport: websocket
  security: end-to-end-encryption (key in share-URI fragment, zero-knowledge relay)
  crdt_library: yjs
  local_persistence: sqlite (tauri-plugin-sql)
  auth: dropped (local identity for presence only)
  relay_deployment: separate project, containerized (Dockerfile), language-agnostic
  local_at_rest_encryption: deferred (v1 stores local CRDT state plaintext)
  relay_url: default baked-in (overridable in settings)
  presence: coarse (who-is-here name + color; no live cursors)
  data_migration: clean slate (fork starts empty)
  relay_room_ttl_days: 30
  relay_log_compaction_updates: 500
tags: [local-first, crdt, yjs, e2ee, tauri, sqlite, websocket, offline-first]
---

# Local-First Collaborative Sync — Specification

> **Phase gate.** This document covers **Phase 1 (Specify)**, **Phase 2 (Plan)**, and **Phase 3 (Tasks)**.
> **No implementation code may be written until this spec is explicitly approved.**

---

## 1. Goals & Context

### 1.1 Summary

Kanist is being re-architected from a **client-server app** (REST + SSE + a database-backed
backend with user accounts) into a **local-first collaborative app**:

- Each device owns its data. The app is fully functional **offline**.
- A project's state is a **CRDT document (Yjs)** that is the single source of truth.
- Projects are shared by **id** through a **thin WebSocket relay** that is **end-to-end
  encrypted** (zero-knowledge — it never sees plaintext).
- Sharing is initiated via a **custom URI** (deep link) carrying the project id and the
  encryption key.
- Local durability uses **SQLite** (via `tauri-plugin-sql`).
- **Desktop only** for this milestone.

### 1.2 In-scope goals

| # | Goal |
|---|------|
| G1 | Full offline create/read/update/delete of projects, sections, tasks, subtasks. |
| G2 | Conflict-free multi-device/multi-user editing of the **same** project via CRDT merge. |
| G3 | Share a project through a custom-URI deep link containing its id + encryption key. |
| G4 | A peer can join a shared project; the relay creates the channel on first join. |
| G5 | Late/async sharing: a joiner receives prior changes even if no other peer is currently online (relay holds an encrypted snapshot). |
| G6 | Zero-knowledge relay: the server cannot read or tamper with project content (E2EE + authenticated encryption). |
| G7 | Lightweight presence (who is currently in a project) for live awareness. |
| G8 | Durable local persistence in SQLite; survives app restarts. |

### 1.3 Non-functional requirements (testable)

| # | NFR | Metric |
|---|-----|--------|
| NFR1 | Local read of a project view | UI renders projected view in **< 50 ms** for a project with ≤ 1,000 tasks (warm). |
| NFR2 | Local write latency | A local edit is reflected in the UI in **< 16 ms** (optimistic, no network wait). |
| NFR3 | Sync convergence | Two online peers converge to identical state within **< 2 s** of an edit on a LAN/normal broadband. |
| NFR4 | Cold join | Joining a shared project of ≤ 1,000 tasks completes (decrypt + apply snapshot + render) in **< 3 s** on broadband. |
| NFR5 | Relay statelessness of meaning | The relay process can be wiped and restarted; no project content is permanently lost as long as **≥ 1 peer** still holds local state. |
| NFR6 | Confidentiality | Relay operator with full disk + memory access cannot recover plaintext project content without a share key. |
| NFR7 | Offline durability | After a force-kill, no committed local edit is lost on restart. |

### 1.4 Out of scope / Negative requirements (explicitly NOT built)

These are intentional to prevent over-engineering and architectural bloat:

- **N1 — No user accounts / server login.** No passwords, sessions, refresh tokens, or
  server-side identity. The existing `features/auth` server flow is removed.
- **N2 — No central database of record.** The relay's disk snapshot is a **cache**, not the
  authoritative store. Authoritative state lives on clients.
- **N3 — No server-side business logic.** The relay does not understand tasks/sections; it
  moves opaque encrypted bytes per room.
- **N4 — No server-side CRDT merge.** Because content is E2E-encrypted, merging happens only
  on clients.
- **N5 — No mobile/web build** in this milestone (desktop Tauri only).
- **N6 — No access revocation / key rotation** in v1 (a share key is a permanent bearer
  capability). Tracked as a known limitation (see §8).
- **N7 — No read-only share links** in v1 (single read-write key per project).
- **N8 — No collaborative cursors / text-level co-editing** of descriptions. Presence is
  coarse-grained (user is "in" the project) only.
- **N9 — No comments, attachments, activity feed, or notifications.**
- **N10 — No conflict-resolution UI.** Conflicts are resolved automatically by CRDT
  semantics; users never see merge dialogs.
- **N11 — No P2P/WebRTC.** Sync is mediated by the WebSocket relay only.
- **N12 — No multi-relay federation / horizontal scaling** design in v1 (single relay
  instance assumed; see §8 for the scale-out note).

---

## 2. Personas & User Journeys (the *what* and *why*)

### 2.1 Personas

- **Solo user** — uses Kanist on one desktop, offline-first, never shares. Must work with
  zero servers running.
- **Collaborator (owner)** — creates a project and shares a link with a teammate.
- **Collaborator (joiner)** — receives a link and edits the shared project.

### 2.2 Journeys

1. **Offline-only.** Solo user creates projects/tasks with no network and no relay. Data
   persists locally.
2. **Share.** Owner clicks "Share", gets a `kanist://` link, sends it out of band (chat,
   email). The link encodes the project id **and** the encryption key.
3. **Join.** Joiner opens the link → OS launches/focuses Kanist → app joins the relay room
   for that id → downloads the encrypted snapshot → decrypts → project appears locally.
4. **Live co-edit.** Both online: edits propagate within ~seconds, presence shows both users.
5. **Async catch-up.** Owner edits while joiner is offline; owner then goes offline. Joiner
   later comes online and still receives the changes from the relay's encrypted snapshot.

---

## 3. Architecture (the *how*) — Phase 2: Plan

### 3.1 Component overview

```
┌──────────────────────────── Desktop App (Tauri) ────────────────────────────┐
│                                                                              │
│  Angular Webview (presentation)                                             │
│   ├─ Stores (signals)  ── projected, read-only view of the CRDT            │
│   └─ Commands (user intent) ─► CrdtProjectRepository                       │
│                                     │ mutate Yjs doc (source of truth)     │
│                                     ▼                                       │
│  Sync layer (TS, in webview)                                               │
│   ├─ Yjs Doc (per project)                                                 │
│   ├─ Crypto (AES-GCM, per-project key)                                     │
│   ├─ RelayClient (WebSocket)  ── sends/receives ENCRYPTED updates          │
│   └─ Persistence bridge ──► Tauri commands                                 │
│                                     │                                       │
│  Rust core (tauri)                                                          │
│   ├─ tauri-plugin-sql (SQLite)  ── stores CRDT state blob + metadata       │
│   └─ tauri-plugin-deep-link     ── receives kanist:// URIs                 │
└──────────────────────────────────────────────────────────────────────────┘
                                     │  WebSocket (TLS)
                                     ▼
┌──────────────────────────── Relay Server (thin) ───────────────────────────┐
│  Rooms keyed by projectId                                                   │
│   ├─ broadcast: forward encrypted updates to other peers in the room        │
│   ├─ snapshot store (disk/KV): latest encrypted snapshot + recent           │
│   │   encrypted update log per room   ← NON-authoritative cache             │
│   └─ GC: drop room cache after inactivity TTL                               │
│  Knows nothing about tasks/sections. Cannot decrypt. No accounts. No DB     │
│  of record.                                                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Source-of-truth & data flow

- The **Yjs document per project is the source of truth.** The Angular signal stores are a
  **read-only projection** rebuilt from the Yjs doc on every change (Yjs `observeDeep`
  → recompute view models). Components still call repository/store methods, but those
  methods now mutate the Yjs doc instead of issuing HTTP calls.
- **Local persistence:** the Yjs document binary (full `Y.encodeStateAsUpdate`) is written
  to SQLite, debounced. On startup, the doc is rehydrated from SQLite.
- **Remote sync:** Yjs updates are **encrypted**, sent to the relay, broadcast to peers, and
  **decrypted + applied** by each peer. New joiners pull the relay's stored encrypted
  snapshot first, then live updates.

### 3.3 CRDT document schema (Yjs)

One `Y.Doc` per project. Proposed shape (entity ids map to the existing domain model):

```ts
// Per-project Y.Doc
doc.getMap('meta')            // Y.Map: { name: string, favorite: boolean, schemaVersion: number }
doc.getArray('sectionOrder')  // Y.Array<string>  ordered section ids
doc.getMap('sections')        // Y.Map<sectionId, Y.Map>
//   section Y.Map: { name: string, taskOrder: Y.Array<string> }
doc.getMap('tasks')           // Y.Map<taskId, Y.Map>
//   task Y.Map: {
//     sectionId: string,         // move = set this field (LWW per-key)
//     name: string,
//     completed: boolean,
//     description?: string,
//     label?: string,
//     startDate?: number,        // epoch ms
//     endDate?: number,
//     completedDate?: number,
//     parentTaskId?: string,
//     subtaskOrder: Y.Array<string>,
//   }
```

**Why this shape:**
- Ordering lives in `Y.Array` (CRDT-correct concurrent insert/reorder), replacing the plain
  `sectionIds[] / taskIds[]` arrays in today's entities.
- A **task move** is a single `sectionId` field set on the task's `Y.Map` (per-key
  last-writer-wins) plus list reorders — avoids "duplicated in two sections" anomalies.
- Subtasks remain tasks with `parentTaskId`, consistent with the current model.
- `schemaVersion` enables forward migration (§7).

> **Mapping note.** Today's immutable `Project/Section/Task` classes become *projection view
> models* derived from the Yjs doc. The domain validation (value objects like `SectionName`)
> is applied at the **command boundary** before writing to the Yjs doc.

### 3.4 Encryption model (E2EE, zero-knowledge relay)

- **Per-project symmetric key**: AES-256-GCM, generated with a CSPRNG at project creation.
- **Stored** locally (SQLite, `projects.share_key`). **Shared** only inside the URI fragment.
- **Each outbound message** (Yjs update or snapshot) is encrypted: `AES-GCM(key, nonce,
  plaintextUpdate)` with a random 96-bit nonce; the ciphertext + nonce (+ auth tag) is what
  the relay stores/forwards.
- **Integrity/authenticity:** AES-GCM's auth tag detects tampering. The relay cannot forge
  content. (Replay is possible but harmless: Yjs update application is idempotent/commutative.)
- **The relay never receives the key.** Custom-URI fragments are processed entirely on the
  local machine and are never transmitted to the relay.

> **Consequence (must hold):** the relay stores *opaque ciphertext*. It therefore **cannot
> compact via Yjs merge.** Compaction is client-driven (§3.6).

### 3.5 Share URI format (custom scheme / deep link)

```
kanist://join/<projectId>#k=<base64url(rawKey)>&v=1
```

- `<projectId>` — opaque, unguessable (UUIDv4, 122 bits of entropy). Used as the relay room id.
- Fragment `#k=...` — base64url-encoded raw AES key. In a custom-scheme deep link the entire
  URI is delivered locally to the app; the **fragment convention** marks the key as a
  client-only secret that must never be logged or sent to the relay.
- `v=1` — link/protocol version for forward compatibility.

Registered via `tauri-plugin-deep-link` (OS-level scheme registration + a capability entry).

### 3.6 Relay protocol (WebSocket)

Per-room (room id = `projectId`). All `payload` fields are **encrypted bytes**; the relay
treats them as opaque.

| Direction | Message | Purpose |
|-----------|---------|---------|
| C → S | `join { roomId }` | Join/create room. Server replies with stored snapshot + recent log. |
| S → C | `sync { snapshot?, updates[] }` | Encrypted snapshot + any buffered encrypted updates. |
| C → S | `update { roomId, payload }` | An encrypted Yjs update. Server appends to log + broadcasts. |
| S → C | `update { payload }` | Broadcast of a peer's encrypted update. |
| C → S | `snapshot { roomId, payload }` | Client-driven compaction: replace stored snapshot, truncate log. |
| C ↔ S | `awareness { roomId, payload }` | Ephemeral presence (encrypted); broadcast, **not** persisted. |
| S → C | `error { code, message }` | Protocol/room errors. |

**Relay persistence (disk snapshot cache):**
- Per room: `latest_snapshot` (encrypted blob) + `update_log` (append-only list of encrypted
  updates since the last snapshot).
- **GC / TTL:** if a room has no connected peers for `RELAY_ROOM_TTL` (default **30 days**),
  its cache is deleted. Because clients hold authoritative state, the room is transparently
  recreated on the next join (a peer re-seeds it).
- **Compaction:** when `update_log` exceeds `RELAY_LOG_MAX` (e.g. 500 updates), the relay
  asks a connected client to send a fresh `snapshot`; on receipt it stores the snapshot and
  clears the log. (The relay cannot compact itself — see §3.4.)

> **Relay deployment (decided):** The relay is a **separate project / repository**, packaged
> as a **container image via its own `Dockerfile`**, and deployed independently of the desktop
> app. **Language is not constrained** — any implementation that honors the protocol in this
> section is acceptable (e.g. Rust `tokio` + `tokio-tungstenite` with `sled`/flat-file
> snapshot storage, or Node/Bun `ws`). The relay has its **own CI/quality gate**; the desktop
> app's CI (AC12) does not build the relay. The desktop app only depends on the relay's
> WebSocket URL (configurable, §3.7 `settings.relay_url`).

### 3.7 Local persistence schema (SQLite via `tauri-plugin-sql`)

```sql
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,         -- = Yjs room id
  name          TEXT NOT NULL,            -- denormalized for fast project list
  favorite      INTEGER NOT NULL DEFAULT 0,
  share_key     TEXT NOT NULL,            -- base64 raw AES-256 key (see at-rest note)
  schema_version INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_synced_at INTEGER
);

CREATE TABLE project_state (
  project_id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  yjs_state     TEXT NOT NULL             -- base64 of Y.encodeStateAsUpdate(doc) (plaintext locally)
);

CREATE TABLE local_identity (
  id            TEXT PRIMARY KEY,         -- single row
  display_name  TEXT NOT NULL,
  color         TEXT NOT NULL
);

CREATE TABLE settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL             -- e.g. relay_url
);
```

- **At-rest encryption note:** local CRDT state is stored **plaintext** in v1 (E2EE protects
  the relay, not the local disk). Optional OS-keychain-backed at-rest encryption is a
  follow-up (§8), not in scope for v1.
- Cross-project views (**Today**, **Upcoming**) iterate over locally-loaded project docs.

---

## 4. Architectural Decision Records (ADRs)

### ADR-001 — Yjs CRDT document is the source of truth
- **Status:** Accepted.
- **Decision:** Each project is a Yjs `Y.Doc`. Angular stores are a derived projection.
- **Consequences:** Domain entity classes become view models; ordering moves into `Y.Array`;
  optimistic UI is automatic; HTTP repositories are removed.

### ADR-002 — WebSocket relay with disk-backed snapshot cache (non-authoritative)
- **Status:** Accepted.
- **Decision:** A thin relay forwards encrypted updates and stores an encrypted snapshot +
  recent update log per room on disk, GC'd by TTL. Clients remain authoritative.
- **Consequences:** Async sharing works even if all peers are offline (G5/NFR5); the relay is
  a cache, not a DB of record (N2).

### ADR-003 — End-to-end encryption; key in share-URI fragment; zero-knowledge relay
- **Status:** Accepted.
- **Decision:** AES-256-GCM per project; key generated locally, transmitted only via URI
  fragment; relay stores/forwards opaque ciphertext.
- **Consequences:** Confidentiality (G6/NFR6); **server cannot merge or compact** (client-led
  compaction); key is a permanent bearer capability (N6, §8 limitation).

### ADR-004 — Per-project Yjs doc == per-relay room, keyed by projectId
- **Status:** Accepted.
- **Decision:** `roomId == projectId == UUIDv4`. One doc per project.
- **Consequences:** Clean 1:1 mapping; cross-project views aggregate multiple local docs.

### ADR-005 — Local persistence via SQLite (`tauri-plugin-sql`)
- **Status:** Accepted.
- **Decision:** Store the Yjs state blob + light metadata + local identity + settings.
- **Consequences:** Fast project list without decoding every doc; simple migrations; raw key
  stored locally (at-rest encryption deferred).

### ADR-006 — Drop server auth; local-only identity for presence
- **Status:** Accepted.
- **Decision:** Remove `features/auth` server flow; keep a local profile (name + color) used
  only for Yjs awareness/presence.
- **Consequences:** No sessions/tokens/interceptors; presence is non-authoritative and
  cosmetic.

### ADR-007 — WebSocket-only transport (no WebRTC)
- **Status:** Accepted.
- **Decision:** Sync is mediated by the relay over WebSocket.
- **Consequences:** Reliable NAT traversal; relay is on the data path (but blind via E2EE);
  no STUN/TURN needed.

---

## 5. Acceptance Criteria (BDD — Given/When/Then)

### AC1 — Offline create persists locally
```gherkin
Given the app is running with no network and no relay reachable
When I create a project, a section, and a task
And I restart the app
Then the project, section, and task are still present
And no error about connectivity is shown
```

### AC2 — Generate a share link
```gherkin
Given an existing local project
When I choose "Share"
Then I receive a URI of the form kanist://join/<projectId>#k=<key>&v=1
And the key in the fragment matches the project's local AES key
And the key is never sent to the relay
```

### AC3 — Relay creates the room on first join
```gherkin
Given a share link for a project that has no active room on the relay
When the first client connects with that projectId
Then the relay creates the room
And the client can publish encrypted updates without error
```

### AC4 — Joiner receives existing content
```gherkin
Given owner has shared a project containing 3 sections and 10 tasks
And the relay holds the latest encrypted snapshot
When a joiner opens the share link
Then within 3 seconds the joiner sees the same 3 sections and 10 tasks
```

### AC5 — Concurrent edits converge (online)
```gherkin
Given two peers are online in the same project
When peer A renames task X and peer B sets task Y completed at the same time
Then both peers converge to: task X renamed AND task Y completed
And no edit is lost
```

### AC6 — Concurrent move of the same task
```gherkin
Given two peers are online in the same project
When peer A moves task X to section S1 and peer B moves task X to section S2 concurrently
Then both peers converge to task X being in exactly one section (last-writer-wins on sectionId)
And task X is not duplicated and not orphaned
```

### AC7 — Async catch-up while all peers offline
```gherkin
Given owner edits a shared project then goes offline
And no other peer is online
When a joiner later comes online and opens the project
Then the joiner receives the owner's edits from the relay snapshot
```

### AC8 — Zero-knowledge relay
```gherkin
Given a relay operator captures all stored room data and memory
When they attempt to read project content without a share key
Then they cannot recover any task/section/project plaintext
And tampered ciphertext is rejected by the client (auth-tag failure)
```

### AC9 — Relay wipe does not lose data
```gherkin
Given a shared project with at least one peer holding local state
When the relay process is wiped and restarted
Then on next join the room is recreated and re-seeded from a peer
And no project content is permanently lost
```

### AC10 — Deep link launches/focuses the app
```gherkin
Given Kanist is installed and the kanist:// scheme is registered
When the user opens a kanist://join/... link from another application
Then Kanist launches or focuses
And navigates to the joined project
```

### AC11 — Wrong key fails safely
```gherkin
Given a share link whose key does not match the project's encryption key
When a client attempts to join and decrypt
Then decryption fails with a clear error
And no partial/garbage state is applied to the local doc
```

### AC12 — CI quality gate
```gherkin
Given the implementation is complete for a task
When `act -W .github/workflows/ci.yml -j build-and-test` runs
Then build, unit tests, and lint all pass (green)
```

---

## 6. Task Breakdown (Phase 3) — dependency-ordered

> Atomic, reviewable units. Each must leave CI green (AC12). **Do not start (Phase 4) until
> this spec is approved.**

### Epic A — Foundations (no UI behavior change yet)
- **A1.** Add deps: `yjs`, `tauri-plugin-sql`, `tauri-plugin-deep-link`; wire Tauri plugins +
  capabilities; register the `kanist://` scheme.
- **A2.** SQLite schema + migration runner (tables in §3.7); Tauri/TS persistence bridge.
- **A3.** Crypto module: AES-256-GCM encrypt/decrypt, key gen, base64url key encode/decode
  (+ unit tests, incl. tamper-detection).

### Epic B — CRDT core (replace data source, keep UI)
- **B1.** `YProjectDocument` wrapper: schema (§3.3), create/load, `encodeStateAsUpdate`,
  `applyUpdate`, `observeDeep`.
- **B2.** Projection layer: derive `ProjectViewModel` (and Today/Upcoming) from the Yjs doc;
  feed existing signal stores read-only.
- **B3.** `CrdtProjectRepository` implementing the existing repository ports by mutating the
  Yjs doc (command-side validation via existing value objects).
- **B4.** Swap DI in `projects.providers.ts` from HTTP repos to CRDT repos; debounced
  persistence to SQLite; rehydrate on startup.

### Epic C — Sharing & sync
- **C1.** Relay server — **delivered as a separate, containerized project** (own repo +
  `Dockerfile` + own CI). Thin WS per §3.6: rooms, broadcast, snapshot+log store, TTL GC,
  log-size-triggered client compaction. Opaque ciphertext only. (Tracked here for visibility;
  not built inside this desktop-app repo.)
- **C2.** `RelayClient` (TS): connect, `join`, send/receive encrypted updates, snapshot
  upload on request, reconnect/backoff.
- **C3.** Share flow: generate key (if absent) + build `kanist://` URI; "Share" UI affordance.
- **C4.** Join flow: deep-link handler → parse id+key → create local project shell → join
  room → apply snapshot → persist.
- **C5.** Presence via Yjs awareness using `local_identity`; coarse "who's here" indicator.

### Epic D — Decommission server stack
- **D1.** Remove `features/auth` (server flow), HTTP repositories, SSE infra, token
  interceptors, related DTOs/mappers/tests.
- **D2.** Local identity onboarding (display name + color); settings screen for relay URL.
- **D3.** Update CSP (`tauri.conf.json`) for `wss://<relay>`; remove old `localhost:8080`
  allowances.

### Epic E — Hardening & docs
- **E1.** Tests for AC1–AC11 (unit + integration; simulate concurrency and offline).
- **E2.** Update `README.md`, `ARCHITECTURE.md`, `docs/local-development.md` (run the relay;
  no backend/JAR; deep-link dev notes).
- **E3.** Performance pass against NFR1–NFR4 with a 1,000-task fixture.

---

## 7. Schema & migration strategy

- `meta.schemaVersion` (Yjs) and `projects.schema_version` (SQLite) track the document shape.
- On load, if a doc's version is older, run forward migrations (pure functions on the Yjs doc)
  before projection.
- New optional fields are additive (CRDT-safe). Breaking shape changes bump the version and
  ship a migration. Mixed-version peers: the higher-version client migrates locally; updates
  remain mergeable as long as fields are additive.

---

## 8. Known limitations & risks (must be acknowledged before approval)

| # | Limitation / Risk | Impact | Mitigation / Follow-up |
|---|-------------------|--------|------------------------|
| L1 | Share key is a permanent bearer capability (N6/N7). | Anyone with the link has permanent read-write; no revocation. | Documented; future: key rotation + new id migration; read-only keys. |
| L2 | Local SQLite stored plaintext at rest. **(Accepted for v1 — deferred.)** | Local disk theft exposes content. | Follow-up: OS-keychain-wrapped key + at-rest encryption. |
| L3 | Relay sees metadata (room id, timing, IPs, sizes) even if blind to content. | Traffic analysis. | Acceptable for v1; document. |
| L4 | Replay of encrypted updates is possible. | Harmless (Yjs idempotent) but worth noting. | Optional monotonic counters later. |
| L5 | Single relay instance (no HA/scale-out design). | Relay outage blocks *new* sync (local still works). | Stateless-cache design eases future multi-instance via shared store. |
| L6 | Yjs doc grows with tombstones over a project's lifetime. | Memory/size growth. | Periodic snapshot compaction (already in protocol). |
| L7 | Deep-link OS registration differs per platform; dev-mode caveats. | Setup friction. | Cover in `local-development.md` (E2). |

---

## 9. Open questions for human review (Phase 1/2 gate)

**Resolved**
- ~~Relay implementation language~~ → **Separate, containerized project (own repo +
  `Dockerfile`); language unconstrained.** (§3.6, Epic C1)
- ~~At-rest encryption (L2)~~ → **Deferred; v1 stores local CRDT state plaintext.** (L2)

- ~~Relay hosting & default URL~~ → **Default hosted relay URL baked in, overridable via
  `settings.relay_url`.** (§3.7)
- ~~Snapshot TTL & log-size thresholds~~ → **30-day room TTL; 500-update log compaction
  trigger.** (§3.6)
- ~~Presence scope~~ → **Coarse only (who-is-here, name + color); no live cursors.** (G7, N8)
- ~~Migration of existing data~~ → **Clean slate; the fork starts empty.**

*All open questions resolved.*

---

## 10. Approval

- [x] **Phase 1 (Specify)** approved — goals, journeys, acceptance criteria.
- [x] **Phase 2 (Plan)** approved — architecture, ADRs, schemas, protocol.
- [x] **Phase 3 (Tasks)** approved — task breakdown.
- [x] **Authorize Phase 4 (Implement).** *(Approved 2026-06-11; implementation begins with Epic A.)*
