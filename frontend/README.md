# Forge Desktop (Frontend)

Tauri + React + Vite desktop app frontend.

## Development

Install dependencies:

```bash
npm install
```

Run the web dev server:

```bash
npm run dev
```

Run the desktop app in development:

```bash
npm run tauri:dev
```

## Build

Web build:

```bash
npm run build
```

Desktop build:

```bash
npm run tauri:build
```

## Git / GitHub

This repo ignores generated artifacts to keep it lightweight:

- `node_modules/`
- `dist/` and `dist-ssr/`
- `src-tauri/target/`
- `src-tauri/gen/`
- local env files (`.env`, `.env.*`)

If you ever accidentally tracked any of the generated folders, remove them from the index:

```bash
git rm -r --cached src-tauri/target src-tauri/gen
```

# Forge Desktop (Frontend)

Electron-style desktop app experience powered by Tauri + React + Vite.

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Tauri (Rust backend shell)

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run web dev mode:

   ```bash
   npm run dev
   ```

3. Run desktop app in Tauri dev mode:

   ```bash
   npm run tauri:dev
   ```

## Build

- Web build:

  ```bash
  npm run build
  ```

- Desktop build:

  ```bash
  npm run tauri:build
  ```

## Git/GitHub Notes

This project ignores generated artifacts so your repository stays lightweight:

- `node_modules/`
- `dist/`, `dist-ssr/`
- `src-tauri/target/`
- `src-tauri/gen/`
- local env files (`.env`, `.env.*`)

If these files were tracked previously, untrack them before pushing:

```bash
git rm -r --cached --ignore-unmatch src-tauri/target src-tauri/gen
```
