import type {
	FindManyOperationAst,
	OperationIncludedField,
	QueryBuilderInput,
	QueryIncludedFieldFromInput,
	SchemaDefinition,
	SchemaWhereInput,
} from '../../src/index.js'

// @ts-expect-error -- The deprecated predicate alias is no longer public.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Importing the removed name proves its absence.
import type { SchemaWhereFactory } from '../../src/index.js'
// @ts-expect-error -- The pointer-only inclusion alias is no longer public.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Importing the removed name proves its absence.
import type { QueryIncludedPointerFromInput } from '../../src/index.js'
// @ts-expect-error -- The operation inclusion alias is no longer public.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Importing the removed name proves its absence.
import type { OperationIncludedPointer } from '../../src/index.js'

interface FixturePointerInclusion {
	readonly field: 'author'
	readonly kind: 'pointer'
}

interface FixtureRelationInclusion {
	readonly field: 'articles'
	readonly kind: 'relation'
}

type FixtureInclusion = FixturePointerInclusion | FixtureRelationInclusion
type FixtureInput = QueryBuilderInput<SchemaDefinition, never, FixtureInclusion>

type CanonicalQueryInclusion =
	/* hover:query-included-field */ QueryIncludedFieldFromInput<
		SchemaDefinition,
		FixtureInput
	>
type CanonicalOperationInclusion =
	/* hover:operation-included-field */ OperationIncludedField<
		FindManyOperationAst<SchemaDefinition, never, never, FixtureInclusion>
	>

declare const canonicalQueryInclusion: CanonicalQueryInclusion
declare const canonicalOperationInclusion: CanonicalOperationInclusion
declare const fixtureInclusion: FixtureInclusion
declare const canonicalWhere: /* hover:schema-where-input */ SchemaWhereInput<SchemaDefinition>

const exactQueryInclusion: FixtureInclusion = canonicalQueryInclusion
const reverseQueryInclusion: CanonicalQueryInclusion = fixtureInclusion
const exactOperationInclusion: FixtureInclusion = canonicalOperationInclusion
const reverseOperationInclusion: CanonicalOperationInclusion = fixtureInclusion

void canonicalWhere
void exactOperationInclusion
void exactQueryInclusion
void reverseOperationInclusion
void reverseQueryInclusion
