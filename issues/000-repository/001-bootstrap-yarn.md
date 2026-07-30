# 001: Bootstrap Yarn 4

- Status: done
- Milestone: 0
- Packages: repository
- Depends on: none
- ADR: ADR-0001, ADR-0011

## Goal

Install the declared Yarn version and produce the first lockfile.

## Acceptance criteria

- [x] Corepack resolves the declared Yarn 4 version.
- [x] `yarn install --immutable` succeeds after the initial lockfile is committed.
- [x] Node 24 is documented and enforced.
- [x] The node-modules linker is retained.

## Tests

- [x] Run a clean install.
- [x] Confirm every workspace is discovered.
