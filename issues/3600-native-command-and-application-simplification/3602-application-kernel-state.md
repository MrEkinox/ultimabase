# 3602: Consolidate application-owned private state

- Status: pending
- Milestone: 36
- Depends on: 3601

## Goal

Replace independent application side tables and bind/read bridges with the
smallest single Core-private application state that materially reduces code
without becoming a public service locator or weakening module boundaries.
