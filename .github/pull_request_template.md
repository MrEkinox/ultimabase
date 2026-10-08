## Outcome

What changes for developers or users, and how it was decided (issue, roadmap
entry or ADR).

## Documentation impact

Choose exactly one and explain the affected contract or why no update is needed.

- [ ] `none` — internal behavior and every public contract remain unchanged:
- [ ] `internal engineering documentation`
- [ ] `public website documentation`
- [ ] `both`

Public behavior, exports, configuration, installation, examples, errors,
security semantics, and supported integrations require a same-change review of
`apps/website/content/docs`. Use
`apps/website/content/documentation-ownership.json` to find likely sections.

## Verification

List the focused checks you ran and the result of `yarn validate:affected`
(or `yarn validate:full` for changes to shared configuration).
