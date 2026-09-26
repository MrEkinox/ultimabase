# Current plan: Mutation data input transformation

- Status: completed
- Milestone: 51
- Baseline: `6fce9471`
- Completed issue: 5101

The user authorized auditing the equivalent mutation-data duplication after
milestone 50. Core may own only immutable recursion through schema field maps
and nested pointer/relation target data. REST and GraphQL retain all wire
wrappers, identities, codecs, validation assumptions, and public errors.

The implementation must delete production lines overall. Mutation request
envelopes, projections, bulk command shapes, and Core Runtime graph
normalization remain unchanged. If the shared callback surface absorbs
transport policy or erases the line reduction, issue 5101 stops at the audit
gate and the prototype is reverted.

No push is authorized.

## Outcome

Core now owns the immutable schema-field and nested pointer/relation data
traversal used by both transports. REST and GraphQL retain their complete wire,
validation, identity, codec, and error policies behind one field callback each.
Production TypeScript adds 189 lines and removes 212, a net reduction of 23
lines.
