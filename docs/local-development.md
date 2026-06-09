# Running TWDist Desktop locally

This guide explains how to run the app against a **local backend** or a **remote production-like API**, using the web dev server or the Tauri desktop shell.

## Prerequisites

- [Bun](https://bun.sh) or Node.js 20+ and npm
- Dependencies installed: `bun install`
- A running **TWDist backend** (local JAR on port `8080`, or a deployed Cloud Run URL)
- For Tauri desktop development:
  - [Rust toolchain](https://rustup.rs/) (`rustup` stable)
  - Linux system libraries (Debian/Ubuntu example):
    ```bash
    sudo apt update
    sudo apt install -y \
      libwebkit2gtk-4.1-dev \
      libgtk-3-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev \
      patchelf
    ```

---

## Quick reference

| Goal | Command | API config | Auth |
|------|---------|------------|------|
| Web UI + local API | `bunx ng serve` | `proxy.conf.json` → `localhost:8080` | Cookies (browser) |
| Tauri + hot reload | `bun run start` | Angular dev proxy (`/api`) | Cookies (via dev server) |
| Packaged desktop build | `bun run tauri:build` | Not yet implemented (future Tauri command) | Bearer tokens (production build) |

---

## 1. Web app + local backend (browser)

Best for UI work with cookie-based auth (same as classic web deployment).

1. Start the backend on `http://localhost:8080`.
2. From this repo:

   ```bash
   bunx ng serve
   ```

3. Open `http://localhost:4200`.

Requests to `/api/*` are proxied to the backend via `proxy.conf.json`.

**Do not** commit changes to `src/app/shared/config/environment.ts` that hardcode a production URL; keep `apiBaseUrl: '/api'` for this mode.

---

## 2. Tauri dev (hot reload)

Default `bun run start` runs the Angular dev server and opens a Tauri window pointed at `http://localhost:4200`.

1. Start the backend (local or remote).
2. Run:

   ```bash
   bun run start
   ```

Tauri loads the Angular dev server URL configured in `src-tauri/tauri.conf.json`. HTTP calls use the dev-server proxy (`/api`); SSE resolves relative paths against `http://localhost:4200`.

Equivalent command:

```bash
bun run tauri:dev
```

---

## 3. Packaged desktop build (local)

To build installable artifacts on your machine:

```bash
bun run tauri:build
```

This runs `ng build --configuration=production` and then packages the app with Tauri.

**Note:** Runtime API configuration via Tauri is not implemented yet. Production Angular builds currently have an empty `apiBaseUrl` and require a future Tauri command to inject settings at startup. Until that is added, use `bun run start` (Tauri dev) or `bunx ng serve` (browser) for day-to-day development.

Artifacts appear under `src-tauri/target/release/bundle/`.

### GitHub Releases (CI)

The release workflow in [`.github/workflows/release.yml`](../.github/workflows/release.yml) still targets the previous Electron packaging flow and will be updated in a future change to use Tauri.

---

## Auth behavior by mode

| Mode | Session storage | Refresh on 401 |
|------|-----------------|----------------|
| `ng serve` / `tauri:dev` (dev) | HTTP-only cookies + `has_session` hint | Cookie refresh |
| Production desktop build | `localStorage` access/refresh tokens | `POST /auth/refresh` with refresh token body |

---

## Verification before a PR

```bash
# Unit tests + lint (same as CI)
bunx ng test --watch=false
bun run lint
bunx ng build --configuration=production --progress=false

# Optional: full CI locally
act -W .github/workflows/ci.yml -j build-and-test
```

Manually verify the path you changed (browser dev, Tauri dev, or both).

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `failed to run custom build command for tauri` | Missing Rust toolchain or Linux WebKit/GTK dependencies |
| `SSE requires an absolute API base URL` | Running a production build without runtime config (not yet implemented) |
| `API base URL is not configured` | Production desktop build without runtime config from Tauri |
| Login works in browser but not desktop | Using production build path; use `bun run start` for dev, or wait for Tauri runtime config |
| CORS errors in browser | Backend CORS / proxy; use `ng serve` proxy, not a hardcoded remote URL in `environment.ts` |
| CSP blocks `fetch` / `EventSource` in desktop build | API host not allowed in `connect-src`; update `src-tauri/tauri.conf.json` |

---

## Desktop security (CSP)

Packaged builds use a restrictive Content Security Policy in `src-tauri/tauri.conf.json`:

- **Production (`csp`)** — local assets only (`default-src`, fonts, images); `connect-src` allows Tauri IPC, local backend (`localhost:8080`), and `https:` for remote APIs.
- **Development (`devCsp`)** — same rules plus `ws://localhost:4200` for the Angular dev server and hot reload.

Tauri automatically injects script hashes/nonces for bundled JS. Angular component styles require `style-src 'unsafe-inline'`.

When runtime API config is added via Tauri, tighten `connect-src` to the configured host instead of broad `https:`.

Native features (file dialogs, HTTP plugin, etc.) also need explicit entries in `src-tauri/capabilities/default.json`.

---

## Related files

- `proxy.conf.json` — web dev proxy
- `src/app/shared/config/environment.ts` — web defaults (`/api`)
- `src/app/shared/config/environment.prod.ts` — packaged Angular build (empty `apiBaseUrl`; future Tauri injection)
- `src-tauri/tauri.conf.json` — Tauri app config (dev URL, CSP, window settings)
- `src-tauri/capabilities/default.json` — Tauri IPC/plugin permissions
