# 3603: Remove static mutation registration

- Status: pending
- Milestone: 36
- Depends on: 3602

## Goal

Resolve schema-class mutation methods from the sole active application's
canonical command graph instead of copying every installed alias into a second
startup-time registry.
