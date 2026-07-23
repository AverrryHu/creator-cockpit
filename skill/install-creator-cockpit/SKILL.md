---
name: install-creator-cockpit
description: Install, launch, update, or repair Creator Cockpit, a local-first self-media content dashboard distributed from GitHub. Use when a user asks to install or open this dashboard, set up a local creator cockpit, update an existing installation, restore a backup, or troubleshoot its local Node and pnpm environment.
---

# Install Creator Cockpit

Use the stable GitHub release from:

`https://github.com/AverrryHu/creator-cockpit`

## Protect Local Data

- Ask where to install before creating a directory.
- Resolve the exact target and do not overwrite a non-empty directory.
- Never delete or replace an existing installation without a backup and explicit confirmation.
- Never ask the user to paste an API key into chat. Direct AI is optional.
- Keep the same browser profile and local origin, normally `http://localhost:3000`. IndexedDB data is scoped to the browser profile and origin.
- Before an update or repair, ask the user to export a complete JSON backup from `设置与备份` whenever the app can still open.
- If data appears missing, check the browser profile, hostname, and port before attempting a restore.

## Install

1. Inspect the operating system and verify that Git and Node.js 22.13 or newer are available.
2. Verify pnpm. Prefer the package-manager version declared in `package.json`.
3. If a prerequisite is missing, explain the smallest required change and ask before installing system software.
4. Query the repository releases and choose the latest stable, non-prerelease tag. For the first public version, use `v1.0.0`.
5. Clone that tag into the user-approved empty directory:

   `git clone --branch v1.0.0 --depth 1 https://github.com/AverrryHu/creator-cockpit.git <target>`

6. Enter the project directory. If pnpm is unavailable, run `corepack enable`; if this needs administrator permission, explain the issue and use a user-local alternative with approval.
7. Run `pnpm install --frozen-lockfile`.
8. Do not create `.env.local` unless the user explicitly wants direct AI analysis.
9. Run `pnpm dev` in a retained terminal session and use the exact Local URL printed by the server.
10. Do not silently change the port. If port 3000 is occupied, ask whether to stop the other service or use another port, and explain that a different port has a separate local data space.
11. Open the exact local URL and keep the server running. Tell the user how to stop and restart it.
12. On first launch, let the user choose demo data or a blank workspace, then enter their name, platform, and content focus.

## Configure Optional AI

1. Copy `.env.example` to `.env.local`.
2. Let the user enter the API key locally; do not request or display the key.
3. Restart the local server.
4. Treat the copyable prompt fallback as the expected behavior when no key is configured.

## Update

1. Export a JSON backup from the app.
2. Preserve the installation directory, browser profile, hostname, and port.
3. Check the latest stable GitHub release and show the version change.
4. Never reset or discard local source changes without explicit consent.
5. Move the installation to the selected stable tag, then run `pnpm install --frozen-lockfile`.
6. Run `pnpm test` and restart the app.
7. Confirm that the existing local data opens and any schema migration completes.

## Repair

1. Read the exact startup or browser error.
2. Confirm the Node.js and pnpm versions and that `pnpm-lock.yaml` exists.
3. Run `pnpm install --frozen-lockfile`, then `pnpm test` if startup still fails.
4. Do not clear browser storage as a troubleshooting shortcut.
5. If data remains unavailable after checking origin and browser profile, restore only from a user-selected JSON backup and use the app's import preview first.
