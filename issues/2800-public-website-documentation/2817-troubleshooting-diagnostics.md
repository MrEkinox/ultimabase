# 2817: Document troubleshooting and diagnostics

- Status: complete
- Milestone: 28
- Packages: `apps/website`, repository-wide public diagnostics
- Depends on: 2806, 2810, 2811, 2812, 2813
- ADR: none

## Goal

Help readers recover from common setup and runtime failures through observable
symptoms and public diagnostics instead of requiring repository-internal
knowledge.

## Acceptance criteria

- [x] Troubleshooting navigation covers startup and plugin graph failures,
      PostgreSQL connectivity and schema synchronization, Typegen, HTTP
      application identity, authentication, and reporting a reproducible issue.
- [x] Every entry starts from a stable public symptom or diagnostic, explains
      likely causes, provides safe checks, and identifies a verified recovery or
      escalation path.
- [x] Security-sensitive guidance never asks readers to expose secrets, disable
      authorization broadly, forge Master context, or bypass validation and
      Hooks.
- [x] Platform-specific workarounds are labelled narrowly and are not presented
      as universal product behavior.
- [x] Error-code reference links to troubleshooting by stable identity while
      conceptual pages remain free of large troubleshooting digressions.
- [x] The reporting guide captures versions, minimal reproduction, sanitized
      diagnostics, expected behavior, and actual behavior.

## Tests

- [x] Documented commands and representative failure/recovery paths are
      exercised where deterministic fixtures exist.
- [x] Links between public errors, troubleshooting pages, and reporting guidance
      pass validation.

## Out of scope

- An interactive support service, collection of secrets or telemetry, generic
  Node.js/PostgreSQL administration, or undocumented internal recovery tools.
