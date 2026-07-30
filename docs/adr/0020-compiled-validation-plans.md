# ADR-0020: Compiled validation plans

- Status: accepted
- Date: 2026-07-30

## Decision

Schema compiles field metadata into immutable, transport-neutral create and
update validation plans. A plan is a discriminated data structure rather than
an executable validator or a wrapper around another schema library.

Compilation derives required, optional, and forbidden input presence; preserves
primitive constraints and nested structure; rejects unknown object fields; and
classifies static, runtime, and database defaults without executing them.

Runtime owns plan execution, default application, and concrete validation
issues. Issues use a closed code union and paths made of property names and
array offsets. REST, GraphQL, jobs, bulk operations, and upserts must consume
the same Runtime behavior.

## Consequences

Static schemas remain the only source of truth, with no duplicated Zod or
transport schema. Plans can be compiled once during application setup and
reused across requests.

Schema does not execute developer callbacks or validate request input. Adding a
new built-in field kind requires adding its validation-plan representation
before application setup can compile schemas containing that field.
