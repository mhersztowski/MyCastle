# Publishing packages to GitHub Packages

MyCastle publishes shared TypeScript packages to **GitHub Packages** (npm registry at `https://npm.pkg.github.com`) under the `@mhersztowski` scope.

## Published packages

| Package | Directory | Latest version |
|---------|-----------|----------------|
| `@mhersztowski/minislib` | `packages/minislib/` | 0.1.0 |

---

## Publishing a new version

### Option A — manual (fastest)

```bash
# 1. Authenticate once — writes token to ~/.npmrc globally
npm config set //npm.pkg.github.com/:_authToken <your-github-token>

# 2. Build
pnpm --filter @mhersztowski/minislib build

# 3. Publish (publishConfig.registry in package.json sets the target registry)
cd packages/minislib
npm publish

# 4. Optionally remove the global token afterwards
npm config delete //npm.pkg.github.com/:_authToken
```

> **Why `npm config set` instead of env vars?**  
> `.npmrc` uses `${NODE_AUTH_TOKEN}` variable substitution, but inline env var prefixes (`NODE_AUTH_TOKEN=xxx npm publish`) are not always reliably picked up depending on the shell and npm version. Writing the token to `~/.npmrc` via `npm config set` always works.

### Option B — via GitHub Actions (tag-triggered)

```bash
# Bump version in packages/minislib/package.json first, then:
git tag minislib-v0.2.0
git push origin minislib-v0.2.0
```

Workflow file: `.github/workflows/publish-minislib.yml`  
Trigger: any tag matching `minislib-v*`

---

## Adding a new publishable package

1. **`package.json`** — add `publishConfig`, remove `private: true`:
   ```json
   {
     "name": "@mhersztowski/my-package",
     "publishConfig": {
       "registry": "https://npm.pkg.github.com"
     }
   }
   ```

2. **Create a workflow** (copy `.github/workflows/publish-minislib.yml`, adjust `--filter` and tag pattern).

3. **`.npmrc`** in the monorepo root already has the scope config — nothing to change there.

---

## Installing `@mhersztowski/*` packages

### Inside the MyCastle monorepo

Use `workspace:*` — pnpm resolves it locally, no registry needed:

```json
"dependencies": {
  "@mhersztowski/minislib": "workspace:*"
}
```

### In an external project (outside the monorepo)

**1. `.npmrc`** in the project directory:

```ini
@mhersztowski:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<your-github-token>
```

**2. `package.json`:**

```json
"dependencies": {
  "@mhersztowski/minislib": "0.1.0"
}
```

**3. Install:**

```bash
npm install
# or
pnpm install
```

### In a user project via the Monaco editor (VFS)

The backend's `handleNodejsRun` automatically injects the `GITHUB_TOKEN` from the server's `.env` as npm config environment variables when spawning `npm install`. No `.npmrc` needed in the project directory — as long as `GITHUB_TOKEN` is set on the server.

The relevant env vars injected:
```
npm_config_@mhersztowski:registry = https://npm.pkg.github.com
npm_config_//npm.pkg.github.com/:_authToken = <GITHUB_TOKEN from .env>
```

---

## Required GitHub token scopes

| Operation | Required scope |
|-----------|----------------|
| Publishing a package | `write:packages` |
| Installing a package | `read:packages` |

The token in `app/mycastle-backend/.env` (`GITHUB_TOKEN`) is used both by the backend for npm install injection and by the GitHub Actions workflow (`secrets.GITHUB_TOKEN` is automatic).
