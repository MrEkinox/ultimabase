# 3903: Preserve scalar hovers and consolidate GraphQL scalar mappings

- Status: completed
- Milestone: 39
- Depends on: 3902

## Goal

Keep Core's field-specific scalar factory aliases as the intentional editor
presentation boundary, while replacing GraphQL's repeated scalar kind switches
and supported-kind lists with one internal mapping.

## Acceptance criteria

- [x] Core documents why field-specific callable aliases remain explicit.
- [x] One GraphQL mapping resolves every built-in scalar kind for ordinary and
      virtual output plus mutation input.
- [x] UUID system IDs and pointer inputs retain their existing GraphQL ID
      special cases.
- [x] Built-in and virtual supported-kind checks reuse the canonical scalar
      mapping without accepting a new kind.
- [x] Source and compiled field-factory hovers remain unchanged.
- [x] Production lines decrease and documentation impact is recorded.

## Outcome

Core retains the field-specific callable aliases that give developers concise
factory names in editor hovers. The shared factory contract now records why
those apparently repetitive aliases are an intentional presentation boundary.

GraphQL now owns one scalar kind-to-type map. Ordinary output, mutation input,
virtual output compilation, and built-in-kind detection reuse it. UUID system
IDs and pointer inputs remain explicit `GraphQLID` exceptions, while enums,
objects, pointers, and relations remain the same structural kinds as before.

Handwritten production TypeScript decreases by 104 lines: 40 added and 144
deleted. No public export, schema shape, codec, or supported kind changed.

The complete issue diff contains 107 additions and 151 deletions, a net
reduction of 44 lines after tracking documentation is included.

## Validation

- GraphQL passed 21 files and 106 tests with no type errors.
- The source factory-hover matrix passed 139 tests.
- The packed Core field-builder and archive declaration suites passed 30 tests.
- `yarn typecheck`, the 536-file/2,554-test repository suite, `yarn lint`, and
  `yarn build` passed.

## Documentation impact

Classification: **internal engineering documentation**.

The internal contract comment, issue, and milestone record the intentional
hover boundary. Public APIs and behavior are unchanged, so package and website
documentation remain accurate without edits.
