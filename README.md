<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2025 SubLang International <https://github.com/sublang-xyz> -->

# <img src="assets/iteron.svg" alt="iteron" width="128" height="128">

[![npm version](https://img.shields.io/npm/v/@sublang-xyz/iteron)](https://www.npmjs.com/package/@sublang-xyz/iteron)
[![Node.js](https://img.shields.io/node/v/@sublang-xyz/iteron)](https://nodejs.org/)
[![CI](https://github.com/sublang-xyz/iteron/actions/workflows/ci.yml/badge.svg)](https://github.com/sublang-xyz/iteron/actions/workflows/ci.yml)

Delegate dev loops to Claude Code, Codex CLI, or any AI coder. Runs autonomously for hours. No costly API keys.

> **Status:**
>
> - [x] Stage 1 - spec scaffolding ready. Get started to adopt the [GEARS](https://sublang.xyz/ref/gears-ai-ready-spec-syntax), the AI-ready spec syntax, for your projects.

## Quick Start

```bash
npm install -g @sublang-xyz/iteron
iteron init
```

Review the sample iteration `specs/iterations/000-spdx-headers.md` and update the copyright text, then prompt your AI coding agent:

```text
Complete Iteration #0
```

## Workflow

<img src="assets/workflow.png" alt="IterOn Workflow" width="530" height="510" style="max-width: 100%; height: auto">

1. **Make Decisions** — Discuss requirements and architecture with AI. It generates decision records in `specs/decisions/`.
2. **Plan Iterations** — Break down work into iteration specs with AI. It generates iteration records in `specs/iterations/`.
3. **AI Executes** — Let AI agents complete the tasks autonomously. They generate code and update `specs/`.

Then loop back to the next decision or iteration.

## Contributing

We welcome contributions of all kinds. If you'd like to help:

⭐ Star the repo if you find IterOn useful.

🐛 [Open an issue](https://github.com/sublang-xyz/iteron/issues) for bugs or feature requests.

🤝 [Open a PR](https://github.com/sublang-xyz/iteron/pulls) for fixes or improvements.

💬 Join the [discussions](https://github.com/orgs/sublang-xyz/discussions) to share ideas and help shape the roadmap.
