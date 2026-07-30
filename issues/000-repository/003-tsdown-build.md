# 003: Configure tsdown workspace builds

- Status: planned
- Milestone: 0
- Packages: all publishable packages
- Depends on: 001, 002
- ADR: ADR-0011, ADR-0016

## Goal

Produce ESM JavaScript, source maps, declarations, and declaration maps for every package.

## Acceptance criteria

- [ ] `yarn build` builds workspaces in dependency order.
- [ ] External dependencies are not bundled.
- [ ] Output targets Node 24 and contains no CommonJS fallback.
- [ ] Package exports resolve to generated files.

## Tests

- [ ] Import each packed package from a temporary ESM consumer.
