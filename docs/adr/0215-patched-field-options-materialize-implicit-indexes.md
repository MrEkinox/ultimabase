# ADR-0215: Patched field options materialize implicit indexes

- Status: accepted
- Date: 2026-08-21

## Context

Schema fields declared by an application turn `indexed: true` and
`indexed: 'unique'` into single-field schema indexes during normalization.
Fields added later through an authorized plugin patch retained the option value
but did not materialize the corresponding index. The compiled field therefore
claimed an index contract that adapters could never observe.

The direct ACL schema option exposed this mismatch because its patch-owned JSON
field requires the same portable GIN index that it had before extension removal.
The defect applies equally to community fields added by schema patches.

## Decision

Applying a `field:add` patch materializes the field's implicit single-field
index whenever its resolved options contain `indexed: true` or
`indexed: 'unique'`. The index and the field share the patch owner,
contribution ID, static options, and protocol provenance because they are two
compiled artifacts of one field contribution.

This behavior matches initial schema normalization. It does not infer indexes
from field kinds, storage adapters, or plugin identities. Composite indexes
remain explicit schema or patch declarations.

## Consequences

- Database adapters receive the same logical index graph for developer fields
  and patch-added fields.
- Plugin authors can rely on the public field option instead of installing
  adapter-specific index behavior.
- Removing or replacing an existing index remains an explicit owner-attributed
  transformation; this decision does not add implicit index mutation APIs.
- Core still has no ACL, JSONB, PostgreSQL, or GIN-specific knowledge.
