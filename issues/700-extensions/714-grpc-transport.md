# 714: Add gRPC transport

- Status: planned
- Milestone: 7+
- Packages: future grpc package
- Depends on: 617
- ADR: new ADR required

## Goal

Generate gRPC services that normalize into the same Operation AST.

## Acceptance criteria

- [ ] Services contain no SQL.
- [ ] Framework errors map to gRPC status codes.
