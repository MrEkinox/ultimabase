# ADR-0232: Core request executors accept schema mutation commands

- Status: accepted
- Date: 2026-09-05
- Refines: ADR-0004, ADR-0225, ADR-0231
- Depends on: ADR-0004, ADR-0164, ADR-0225, ADR-0231

## Context

REST v1 must execute create, update, delete, upsert, and their homogeneous bulk
forms without receiving an application, engine, adapter, transaction, or
general Runtime executor. Unlike reads, public schema commands already own the
canonical mutation-input, unique-target, selection, inclusion,
update-expression, and itemized-batch normalization boundaries.

Letting REST construct a second mutation AST would risk drifting from those
commands. Exposing the internal batch executor would also reveal transaction
or projection mechanics that transports do not own.

## Decision

`ApplicationRequestExecutor` adds
`executeMutation(context, schema, request)`. The request is a closed union of
the eight existing schema-command discriminants: singular and many forms of
create, update, delete, and upsert. Core validates the request envelope, binds
the exact application context, checks cancellation, and delegates to the same
schema-command functions used by direct TypeScript callers.

The method does not accept arbitrary Operation ASTs. It cannot select authority,
open transactions, access adapters, or change lifecycle state. Core's existing
schema commands remain the sole owners of logical operation construction.

REST decodes only its wire representation before calling this method. Concise
create and update bodies become existing schema-command inputs; pointer,
binary, bigint, embedded, list, and plugin-field values use their exact field
contracts. Numeric tagged values become Core's nominal `increment` and
`decrement` inputs. Bulk requests keep their existing homogeneous ordered
command shapes.

Every non-empty mutation body is counted as a byte stream before JSON parsing.
The configured limit remains authoritative even without `Content-Length`, and
declared length mismatches or ambiguous transfer framing fail normalization.
The body request and Core context share the HTTP request's cancellation signal.

## Consequences

- REST and direct schema commands produce the same logical mutations and enter
  the same policy, validation, hook, transaction, persistence, result, and
  event pipeline.
- Bulk requests remain atomic batches of ordered singular operations; the
  request facade exposes neither partial success nor set-based business hooks.
- Verified Master contexts bypass authorization only because Core receives the
  original application-owned context; mutation validation and integrity work
  remain installed.
- Future transports may reuse the schema-command boundary without importing
  REST, but cannot execute arbitrary internal operations through it.

## Non-goals

- A generic Operation AST or batch executor.
- REST response envelopes, error-to-status mapping, or field serialization.
- Plugin operations, authentication, file uploads, or public set-based writes.
