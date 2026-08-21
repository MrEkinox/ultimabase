# Current plan

## Objective

Complete milestone 18 so applications install one ACL plugin while community
JSON-backed field plugins gain portable structural containment.

## Order

1. Issue 1801 — decide the field-owned containment contract (`completed`).
2. Issue 1802 — implement Core and Typegen authoring (`completed`).
3. Issue 1803 — implement generic PostgreSQL compilation (`completed`).
4. Issue 1804 — migrate ACL and delete its bridge atomically (`planned`).
5. Issue 1805 — verify the complete public and PostgreSQL vertical (`planned`).

## Resume point

Start issue 1804 by migrating both ACL authorization and reference discovery to
the ordinary field-owned `contains` leaf. Delete the opaque ACL containment
contracts and `@ultimabase/acl-postgres-plugin` atomically; do not leave a
fallback or empty bridge package. Keep ACL policy semantics and PostgreSQL
compilation independent, and do not resume ACL hardening issues 432 through 435
until milestone 18 has removed their dependency on the bridge package.
