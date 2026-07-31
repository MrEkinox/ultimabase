# ADR-0027: Native binary values

- Status: accepted
- Date: 2026-07-31
- Extends: ADR-0018, ADR-0020

## Decision

`binaryField()` represents raw bytes as `Uint8Array`. Node.js `Buffer` values
remain valid inputs because `Buffer` extends the native byte-array contract.
The field does not select Base64, hexadecimal, multipart, or another transport
encoding.

Binary fields support common presence, nullability, immutability, list,
default, index, description, and extension metadata.
`validation.length.min/max` describes byte counts through non-negative safe
integers. Validation plans retain those bounds under the distinct `binary`
kind.

Static binary defaults are copied when schema metadata is created. The copy
preserves typed-array subclasses while receiving independent byte storage.
Structured and list defaults apply the same copy boundary recursively.
Validation-plan compilation takes another snapshot so compiled plans never
share mutable byte storage with schema metadata.

JavaScript cannot freeze the indexed contents of a non-empty typed array.
UltimaBase therefore defines binary immutability through ownership isolation:
Schema copies declaration values, and Runtime must copy binary values at input
and output boundaries. Readonly TypeScript object properties do not replace
that runtime copy requirement.

Database adapters choose physical storage. PostgreSQL may map binary fields to
`bytea`, while GraphQL, REST, and generated clients own their respective wire
codecs.

## Consequences

Application code uses native byte operations without coupling Schema to
PostgreSQL or a transport encoding. `Buffer` remains convenient in Node.js
without becoming the public base type.

Binary copies consume memory proportional to their value size. This cost is
required to prevent caller-owned mutable storage from changing framework
snapshots. Future streaming upload support must use a separate transport and
storage contract rather than placing streams inside `binaryField`.
