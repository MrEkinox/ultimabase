# 2818: Add the first French reader journey

- Status: complete
- Milestone: 28
- Packages: `apps/website`
- Depends on: 2802, 2803, 2805, 2806
- ADR: none

## Goal

Prove localization with a coherent human-reviewed French entry path instead of
a collection of isolated translated labels.

## Acceptance criteria

- [x] `/fr` presents the same product promise and pre-release honesty as the
      English landing without translating identifiers or code.
- [x] French Introduction, Installation, First Application, and Project
      Structure pages preserve the validated English examples.
- [x] Navigation, search, metadata, accessibility labels, previous/next links,
      and locale switching are translated consistently.
- [x] Missing French pages lead clearly to available English content without
      silent mixed-language rendering.
- [x] Translation metadata records the English source and makes stale French
      content detectable when the source changes.
- [x] A short terminology glossary guides future English-to-French work.

## Tests

- [x] French routes, search, canonical metadata, and locale switching have
      focused browser coverage.
- [x] Code blocks remain equivalent to their validated English sources where
      only surrounding prose is translated.

## Out of scope

- Full French parity, automatic translation, additional locales, or locale
  detection that overrides an explicit reader choice.
