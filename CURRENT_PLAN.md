# Current plan

## Objective

Complete milestone 18 so applications install one ACL plugin while community
JSON-backed field plugins gain portable structural containment.

## Order

1. Issue 1801 — decide the field-owned containment contract (`completed`).
2. Issue 1802 — implement Core and Typegen authoring (`completed`).
3. Issue 1803 — implement generic PostgreSQL compilation (`completed`).
4. Issue 1804 — migrate ACL and delete its bridge atomically (`completed`).
5. Issue 1805 — verify the complete public and PostgreSQL vertical (`planned`).

## Resume point

Start issue 1805 by verifying the complete public, packed, and PostgreSQL ACL
vertical after the bridge removal. Confirm that documentation and examples
show one ACL plugin, and keep ACL hardening issues 432 through 435 paused until
milestone 18 closes.
