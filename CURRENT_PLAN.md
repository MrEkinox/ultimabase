# Current plan

## Objective

Milestone 22 extracts only the direct field `validation` option and its
synchronous Standard Schema execution into the optional official
`@ultimabase/validation-plugin` package. Core keeps required presence,
nullability, canonical field shapes, defaults, generators, immutable and
generated rules, structural snapshots, decimal precision and scale, and the
mandatory mutation pipeline.

Applications that do not install the plugin have no `validation` field option
and execute no application field validators. Installing the plugin restores the
accepted single-pass behavior after all input resolution and before
value-dependent enforcement. Master never bypasses that behavior.

## Order

1. Issue 2201 — decide the optional field-validation plugin boundary (`completed`).
2. Issue 2202 — add the generic final mutation-input guard boundary (`completed`).
3. Issue 2203 — extract the complete Standard Schema validation vertical (`ready`).
4. Issue 2204 — verify optional installation and the complete vertical (`planned`).

## Resume point

Start issue 2203 by extracting the direct `validation` field option, Standard
Schema normalization, and final-value traversal into the complete optional
`@ultimabase/validation-plugin` package. Perform the ownership transfer
atomically: Core must keep every structural invariant while applications
without the plugin must reject the option and allocate no validation behavior.

ACL hardening issues 432 through 435 and generated-schema issue 810 remain
deliberately paused.
