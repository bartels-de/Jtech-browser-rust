# Auto-update (signed releases from GitHub)

JTech Browser updates itself from the GitHub releases of
**https://github.com/bartels-de/Jtech-browser-rust** using the official Tauri 2 updater
(`tauri-plugin-updater`). Every update is **signed**; the app only installs files whose
signature matches the public key built into it.

How it works:

1. You push a tag such as `v0.2.0`.
2. GitHub Actions (`.github/workflows/release.yml`) builds the Windows NSIS installer, signs it
   with your private key (stored as a GitHub secret) and creates a GitHub Release containing the
   installer, its `.sig` signature and `latest.json`.
3. Installed copies fetch
   `https://github.com/bartels-de/Jtech-browser-rust/releases/latest/download/latest.json`,
   compare versions, download the installer, verify the signature and install it in
   *passive* mode (small progress window, no questions), then relaunch.

In the app: **Settings > Über JTech** shows the installed version, "Nach Updates suchen",
download progress, release notes and "Jetzt neu starten". Automatic checks run ~15 s after
startup (default on) and optionally every 6/12/24/72 h. When an update is found, a small bar
appears in the header (above the page, never over it). Nothing is installed without a click.

---

## One-time setup

Run all commands in a terminal in `C:\Users\barte\Documents\jtech-browser`.

### 1. Install the new npm packages

```
npm install
```

This adds `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` (already listed in
`package.json`) and updates `package-lock.json`. Commit the updated lock file – CI uses `npm ci`.
The Rust crates (`tauri-plugin-updater`, `tauri-plugin-process`) are downloaded by cargo on the
next build.

### 2. Signing key (already done)

The key pair was created with
`npx tauri signer generate -w %USERPROFILE%\.tauri\jtech.key`, and the **public key** is
already in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`, key ID `1BC5ECA501A0C3F3`).

- `%USERPROFILE%\.tauri\jtech.key` is the **private key**. Keep it secret and back it up
  (e.g. password manager) together with its password. **Never commit it.** If you lose it,
  installed copies can no longer be updated – users would have to reinstall manually.
- If you ever generate a new key, paste the content of the new `jtech.key.pub` into
  `pubkey` and update both secrets; copies with the old key then need one manual reinstall.

### 3. Add the two secrets on GitHub

Repository **Settings > Secrets and variables > Actions > New repository secret**:

| Name | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | the **content** of `jtech.key` (open it in a text editor, copy everything) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you chose when generating the key |

Also check **Settings > Actions > General > Workflow permissions** = "Read and write
permissions" (the workflow already requests `contents: write`, this setting must allow it).

### 4. First push to the repository

```
git init
git add .
git status
git commit -m "Initial commit: JTech Browser with signed auto-update"
git branch -M main
git remote add origin https://github.com/bartels-de/Jtech-browser-rust.git
git push -u origin main
```

Look at `git status` before committing: there must be **no** `*.key` file, no `node_modules`,
no `src-tauri/target`.

---

## Publishing a release

1. Raise the version – **the same number in all three files**:
   - `package.json` -> `"version"`
   - `src-tauri/Cargo.toml` -> `version` under `[package]`
   - `src-tauri/tauri.conf.json` -> `"version"`

   The updater compares semantic versions: the new one must be higher than the installed one
   (e.g. `0.1.0` -> `0.1.1`).
2. Commit, tag and push:

   ```
   git add -A
   git commit -m "Release v0.1.1"
   git tag v0.1.1
   git push
   git push --tags
   ```
3. Watch **Actions** on GitHub (~10–20 min for a cold build). Afterwards **Releases** shows
   `JTech Browser v0.1.1` with `..._x64-setup.exe`, `..._x64-setup.exe.sig` and `latest.json`.
4. Optional: edit the release text. The release notes shown in the app come from `latest.json`
   (`notes`), which is written from `releaseBody` in the workflow – change it there or edit
   `latest.json` before users check.

The tag must start with `v`, otherwise the workflow does not run.

## Testing the update flow

1. Build and install the **old** version once: either install the installer from the first
   release, or locally with `npm run tauri build` (needs the env vars
   `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` set, because
   `createUpdaterArtifacts` is on) and run `src-tauri\target\release\bundle\nsis\*-setup.exe`.
2. Publish a higher version as described above.
3. Start the installed JTech -> after ~15 s the bar "JTech 0.1.1 ist verfügbar" appears
   (or Settings > Über JTech > "Nach Updates suchen").
4. "Herunterladen" -> progress bar -> "Jetzt neu starten" -> a small installer window runs,
   JTech restarts and Settings > Über JTech shows the new version. Bookmarks, history and
   settings stay (same identifier `com.jtech.browser`, same data folder).

Error cases to try: disconnect the network ("Keine Internetverbindung…"), no release yet
("Es wurde noch kein Update veröffentlicht…"), wrong key / tampered file ("Die Signatur des Updates ist
ungültig…" – nothing is installed).

## Public vs. private repository

The updater downloads `latest.json` and the installer **anonymously**. That only works if the
repository is **public**. With a private repository GitHub answers 404, which the app reports
as "no release published".

Private repositories would require an access token sent with every update request. A token
built into the app can be extracted by anyone who has the installer, so it is **not**
embedded here. Alternatives if the code must stay private: a separate public repository that
only hosts releases (change the endpoint in `tauri.conf.json` and let the workflow publish
there with a token secret), or your own static download server.

## Notes and limits

- **Do not change `identifier`** (`com.jtech.browser`) in `tauri.conf.json`: it determines the
  data folder (`%APPDATA%\com.jtech.browser`) and the installer's identity. Changing it would
  install a second app and "lose" all existing data.
- The executable is still named after the Cargo package (`tauri-app.exe`); the product name
  shown everywhere is "JTech Browser". Renaming the package changes the exe name – possible, but
  then do it before the first public release.
- Updater permissions are granted only to the UI webview `ui`
  (`src-tauri/capabilities/updater.json`: `updater:default`, `process:allow-restart`).
  Website tabs never get them.
- On Windows the installer quits the app via `process::exit`; the UI therefore calls
  `prepare_update_exit` first so statistics and the "clear on exit" marker are saved.
- Only Windows (NSIS) is built. The `.msi` target is not part of the update channel.
- Workflow action pinned to `tauri-apps/tauri-action@v0.6.2`; `v1` exists and can be adopted
  later after checking its changelog.
