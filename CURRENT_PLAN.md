# Current plan

## Objective

Milestone 20 replaces the closed built-in field-validation DSL with one
validator-neutral Standard Schema boundary. Presence and storage shape remain
inspectable direct field options, while Standard Schema owns additional
application validation without transforming canonical values.

## Order

1. Issue 2001 — decide the Standard Schema validation boundary (`completed`).
2. Issue 2002 — move required presence to a direct field option (`completed`).
3. Issue 2003 — move inspectable decimal shape metadata to direct options (`ready`).
4. Issue 2004 — replace the field-constraint DSL with Standard Schema (`planned`).
5. Issue 2005 — prove validator interoperability and generated DX (`planned`).
6. Issue 2006 — verify the complete validation vertical (`planned`).

## Resume point

Start issue 2003 by moving decimal precision and scale to direct inspectable
options. Do not preserve the old nested shape metadata: UltimaBase is still in
development, and every replacement removes its superseded API in the same
issue. ACL hardening issues 432 through 435 remain deliberately deferred until
explicit direction.
