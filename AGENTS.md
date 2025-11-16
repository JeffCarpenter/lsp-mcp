# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the CLI entry (`index.ts`), orchestration (`app.ts`), config helpers (`config.ts`), LSP managers (`lsp*.ts`), and generated metadata in `3rdparty/metaModel.ts`.
- `src/resources/` stores the protocol schema copied to `dist/resources/` by `yarn build`; edit only when regenerating.
- `dev/` contains runnable configs (`dev.config.json`, `prod.config.json`) plus `dev/mcp-cli/*.json` launchers for the `yarn mcp-cli:*` scripts.
- Build artifacts live in `dist/`; never hand-edit compiled JS.

## Build, Test & Development Commands
- `yarn dev` / `yarn dev:simple` run `ts-node` over `src/index.ts`; add `--methods` or `--lsp` flags to mirror MCP scenarios.
- `yarn build` transpiles with `tsc` and copies resources; `yarn build:docker` wraps the result into the Docker image.
- `yarn start` executes the compiled CLI.
- `yarn mcp-cli:*` boot sample configs for regression checks against the MCP CLI client.
- `yarn lint` + `yarn format` enforce ESLint (@typescript-eslint) and Prettier baselines; run before committing.

## Coding Style & Naming Conventions
- Follow `.editorconfig`: LF endings, 2-space indentation, trimmed trailing whitespace.
- Use ES exports, camelCase functions, PascalCase classes (`App`, `LspManager`), and SCREAMING_SNAKE_CASE only for env flags.
- Keep files focused: protocol helpers in `src/lsp-methods.ts`, config validation in `config.ts`, tool orchestration in `tool-manager.ts`.

## Testing Guidelines
- Jest is the designated framework (`yarn test`). Create specs under `src/__tests__/` or alongside modules as `*.spec.ts`.
- Cover CLI parsing (`buildConfig`), lazy LSP startup, and tool registration with mocked transports; document manual MCP CLI verification in PR notes until coverage lands.

## Commit & Pull Request Guidelines
- Mirrors current history: short imperative subject lines (e.g., “Fix docker image push”), no trailing periods, reference issues with `(#123)` when applicable.
- Each PR should describe config changes, list commands run (`yarn build`, `yarn mcp-cli:simple`, etc.), and attach logs or screenshots for user-facing changes.
- Highlight generated files (schema, dist assets) separately so reviewers can diff logic apart from artifacts.

## Security & Configuration Tips
- Config files (`dev/*.json` or user-provided `--config`) may contain workspace paths; scrub secrets before committing and prefer relative paths inside containers.
- `--lsp` commands are passed through `sh -c`; quote arguments carefully to avoid shell injection and document any required host binaries.
- When updating the protocol schema in `src/resources/`, capture the upstream source in the PR description so others can reproduce the regeneration step.
