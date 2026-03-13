# DBSOF UI

This monorepo packages a reusable studio-style UI that can be wired up to any
infrastructure backend. The codebase keeps the full component library intact
while moving provider-specific integrations behind a platform abstraction so it
can act as a starting point for new projects. Out of the box it runs purely as
frontend UI; you can later add your own API adapter without changing the UI
components.

## Workspaces

This repo is organised using Yarn workspaces as follows:

- `/web`: The main UI shell that wires together routing, state management, and
  shared components. See <./web/readme.md> for build and development steps.
- `/shared`: Shared component packages, including the graph dependency
  visualiser, terminal, schema graph, inspector, and editor integrations that
  can be reused across different studio deployments.

## Getting started

Install dependencies from the repo root:

```sh
yarn install
```

Then start the web workspace in development mode (no backend required):

```sh
cd web
yarn dev
```

The UI serves at `http://localhost:3002/ui` and renders using local sample
content. When you're ready to integrate with your own platform, provide your
API adapter without changing the UI code.
