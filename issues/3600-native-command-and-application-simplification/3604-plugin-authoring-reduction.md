# 3604: Simplify official plugin option and identity authoring

- Status: pending
- Milestone: 36
- Depends on: 3601

## Goal

Remove repeated option-boundary and plugin-identity declarations across the
official plugins while retaining exact diagnostics, inference, and package
contracts. Keep only helpers whose final production delta is negative.
