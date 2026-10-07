# 733: Add web and network fields

- Status: superseded
- Milestone: 7+
- Packages: future `@ultimabase/standard-fields-plugin`
- Depends on: 730
- ADR: none
- Superseded by: 2007

Issue 2007 supersedes these unimplemented factories. URL, hostname, and IP
syntax compose with native string fields and Standard Schema validators. A
future field with distinct `inet` or `cidr` storage or Query semantics would
require its own evidence and plugin-field contract. The original proposal
remains below as historical context.

## Goal

Add portable `urlField`, `hostnameField`, and `ipField` factories derived from
native string fields.

## Acceptance criteria

- [ ] URL options explicitly control protocols, authentication, fragments, queries, and relative URLs.
- [ ] Secure defaults require a recognized protocol and reject embedded credentials.
- [ ] Hostname validation distinguishes DNS names from arbitrary URL input.
- [ ] IP validation supports IPv4, IPv6, or both through a typed option.
- [ ] All factories retain their logical kind while lowering to strings for generic adapters.

## Tests

- [ ] Runtime tests cover valid forms, malformed forms, and security-sensitive URL cases.
- [ ] Compile-time tests cover the protocol and IP-version option unions.

## Out of scope

- PostgreSQL `inet` or `cidr` storage optimizations and network reachability checks.
