# ADR-0011: Node ESM toolchain

- Status: accepted
- Date: 2026-07-30

## Decision

Target Node.js 24+, ESM-only packages, TypeScript strict mode, Yarn 4 with `node-modules`, and tsdown for library builds.

## Consequences

The project avoids dual-package hazards and older runtimes. TypeScript checks remain separate from fast build transformation.
