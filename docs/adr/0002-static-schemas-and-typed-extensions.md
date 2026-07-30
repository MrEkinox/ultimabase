# ADR-0002: Static schemas and typed extensions

- Status: accepted
- Date: 2026-07-30

## Decision

Explicit TypeScript schema values are the source of truth. Optional capabilities contribute generic typed `SchemaExtension` or `FieldExtension` values.

## Consequences

The schema package remains independent from CLP, ACL, fields security, databases, and transports. Missing handlers for declared extensions fail application setup.
