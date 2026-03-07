<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Development

## Running from Source

```bash
git clone https://github.com/sublang-dev/boss.git
cd boss
npm install && npm run build
npm link
```

`npm link` points the global `boss` command to this checkout. After code changes, rebuild with `npm run build` (or use `npm run dev` for watch mode).

## Dev Sandbox Image

The CI pipeline publishes a development image from `main` on every push. To use it:

```bash
boss init --image ghcr.io/sublang-dev/boss-sandbox:dev-latest
```

If you have already initialized, edit `~/.boss/config.toml`:

```toml
[container]
image = "ghcr.io/sublang-dev/boss-sandbox:dev-latest"
```

Then pull and restart:

```bash
podman pull ghcr.io/sublang-dev/boss-sandbox:dev-latest
boss stop && boss start
```

### Image Tags

| Tag | Description |
| --- | --- |
| `latest` | Latest release (default) |
| `<version>` | Pinned release (e.g. `0.3.0`) |
| `dev-latest` | Latest build from `main` |
| `<short-sha>` | Specific commit build (e.g. `7633572`) |
