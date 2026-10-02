# Current plan: Standard mechanics canaries

- Status: completed
- Milestone: 66
- Active issue: none
- Next issue: none

## Objective

Test fdir discovery, then simplify duplicated Password Auth cookie responses.
Retain only behavior-preserving replacements that reduce net complexity.
[Issue 6602](issues/6600-standard-mechanics-canaries/6602-discovery-and-cookie-canaries.md) owns evidence.

## Locked decisions

- No public API, diagnostic, security, Typegen or Runtime capability regression.
- Count replacement schemas, compatibility code and dependencies, not gross deletions.
- Reject and remove an experiment if parity or worthwhile simplification fails.
- One issue at a time; full validation before retention/commit; no push authorized.

## Blocker

None.

## Next verifiable action

None scheduled. Cookie-route simplification is fully validated; fdir is rejected
on ordering/adaptation cost. Issue 6602 owns the final audit and coverage evidence.
