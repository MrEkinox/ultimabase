# ADR-0006: Access-control plugins

- Status: accepted
- Date: 2026-07-30

## Decision

CLP, ACL, roles, and field permissions are independent plugins built on neutral access contracts.

CLP controls schema operations. ACL controls individual objects. Field permissions control selection and mutation. Final access requires every enabled layer to allow the operation.

## Consequences

Applications pay only for installed capabilities. ACL is the row-level permission mechanism; there is no duplicate row-permission engine.
