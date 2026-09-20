# Soft Delete documentation refresh

User-approved scope: make the Soft Delete guide linear and provide concrete
REST and GraphQL workflows alongside the server-side API.

## Delivered

- Explain the three modes before following one explicit-mode Post example.
- Show configuration, startup, creation, soft deletion, and a visibility check.
- Document Typegen's role in plugin options, methods, and result fields; keep
  startup separate from the configuration module loaded by static generation.
- Explain transport installation and schema-mutation exposure switches.
- Provide REST requests and GraphQL documents for creation, soft deletion, and
  subsequent reads, with expected responses and repeated-call errors.
- Show private server restoration and purge after the client workflows.
- Demonstrate native REST DELETE and GraphQL deletePost in replace-delete mode,
  including why their pre-delete results still contain isDeleted: false.
- End with shared visibility, Access and Hooks semantics, limits, and practical
  troubleshooting. Classify the page as a guide in the editorial plan.

Documentation impact: both.

The public guide and editorial plan changed; this internal handoff records
verification. The package README already describes the same behavior and needs
no contract change.

## Scope audit

No API, Runtime, transport, dependency, or authorization behavior changed.
Restore and purge remain private Master-only commands. The unrelated local
next.config.mjs LAN-address change is excluded from this commit.

## Validation

- Website typecheck, lint, and production build passed.
- Five assembled TypeScript example files compiled against package exports and
  declarations generated from the Post application graph with zero diagnostics.
- All four JSON examples parsed. All four GraphQL documents validated against
  the generated Post GraphQL schema without errors.
- Website content validation: 65 of 66 tests passed. The existing LAN-host test
  expects 192.168.1.135, while the unrelated local next.config.mjs edit configures
  192.168.1.88. No Soft Delete content check failed.
- All 20 preview-readiness browser tests passed.
- Desktop/light and mobile/dark checks returned HTTP 200, with no client errors
  or page overflow. REST and GraphQL screenshots were visually reviewed.
  Desktop accessibility checks passed. Mobile dark mode retains the existing
  shared syntax-theme contrast warning on the development audit comment.
- Formatting and whitespace checks passed. No database execution or unrelated
  package test suite was needed for this documentation-only change; transport
  semantics were checked against the existing PostgreSQL integration tests.

No changes were pushed.
