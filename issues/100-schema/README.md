# Milestone 1 — Static schemas

Implement schema contracts and inference before Core or Runtime behavior.

Issue 144 completed the callback-inference phase of the now
[paused ACL hardening and DX plan](../../CURRENT_PLAN.md). It generalizes
schema-aware callback inference for every typed extension; ACL supplies the
first concrete proof without becoming a Core dependency.

Issue 145 records the current embedded-object value contract, including nested
Access and input-resolution occurrence semantics plus field capabilities that
require top-level storage.
