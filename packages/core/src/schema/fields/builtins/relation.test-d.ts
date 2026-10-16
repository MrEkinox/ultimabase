import { expectTypeOf, test } from 'vitest'

import {
	relationField,
	type RelationRule,
	type RelationWhere,
	type RelationWhereResolver,
	type SchemaClass,
	type SchemaInputsTypeInfo,
	type SchemaTypeInfo,
	type WhereBuilder,
} from '../../../index.js'
import type { RequestContext } from '../../../plugin.js'

interface RelationWhereTargetTypeInfo extends SchemaTypeInfo {
	readonly fields: 'active' | 'score'
	readonly inputs: SchemaInputsTypeInfo & {
		readonly where: {
			readonly active?: { readonly eq?: boolean }
			readonly score?: { readonly gte?: number }
		}
	}
	readonly item: {
		readonly active: boolean
		readonly id: string
		readonly score: number
	}
	readonly key: 'TypedRelationWhereTarget'
	readonly numericFields: 'score'
	readonly output: {
		readonly active: boolean
		readonly id: string
		readonly score: number
	}
	readonly persistedFields: 'active' | 'score'
	readonly selectableFields: 'active' | 'id' | 'score'
}

declare const Target: SchemaClass<RelationWhereTargetTypeInfo>

test('types static and contextual relation filters from the exact target', () => {
	const staticWhere = {
		active: { eq: true },
		score: { gte: 10 },
	} satisfies RelationWhere<typeof Target>

	const staticRule: RelationRule<typeof Target> = { where: staticWhere }
	void staticRule
	const resolver: RelationWhereResolver<typeof Target> = ({
		context,
		where,
	}) => {
		expectTypeOf(context).toEqualTypeOf<RequestContext>()
		expectTypeOf(where).toEqualTypeOf<WhereBuilder<typeof Target>>()
		return where.eq('active', true).gte('score', 10)
	}
	const contextualRule: RelationRule<typeof Target> = { where: resolver }
	void contextualRule
	// @ts-expect-error -- Relation filters are declared in `.with({ relations: … })`.
	relationField({ target: () => Target, where: staticWhere })

	const invalidStatic = {
		// @ts-expect-error -- Static filters use only exact target fields.
		missing: { eq: true },
	} satisfies RelationWhere<typeof Target>
	void invalidStatic

	// @ts-expect-error -- Contextual relation filters are synchronous.
	const asyncResolver: RelationWhereResolver<typeof Target> = async () => {
		await Promise.resolve()
		return { active: { eq: true } }
	}
	void asyncResolver

	const invalidResolver: RelationWhereResolver<typeof Target> = ({ where }) => {
		// @ts-expect-error -- Builder fields are correlated with the target.
		return where.eq('missing', true)
	}
	void invalidResolver
})
