# 003: Configure tsdown workspace builds

- Status: done
- Milestone: 0
- Packages: all publishable packages
- Depends on: 001, 002
- ADR: ADR-0011, ADR-0016

## Goal

Produce ESM JavaScript, source maps, declarations, and declaration maps for every package.

## Acceptance criteria

- [x] `yarn build` builds workspaces in dependency order.
- [x] External dependencies are not bundled.
- [x] Output targets Node 24 and contains no CommonJS fallback.
- [x] Package exports resolve to generated files.

## Tests

- [x] Import each packed package from a temporary ESM consumer.

## Implementation notes

- Yarn runs package build scripts in topological workspace order. Each package resolves the root tsdown binary without duplicating it in package dependencies.
- tsdown emits ESM `.js` and `.d.ts` files because each package declares `"type": "module"`. This keeps generated files aligned with package exports without a CommonJS condition.
- JavaScript source maps and declaration maps are enabled. A temporary non-empty public export verified that both maps are emitted before the fixture was reverted.
- `deps.neverBundle` keeps workspace and third-party dependencies external. A temporary GraphQL re-export verified that the generated JavaScript retains its external `graphql` import before the fixture was reverted.
- `yarn test:pack` builds archives, validates their export targets, and imports every archive from a temporary ESM consumer.
