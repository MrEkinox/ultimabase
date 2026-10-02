import { describe, expect, it } from 'vitest'

import {
	RelationAuthor,
	RelationPost,
} from '../../../tests/fixtures/relation-fixture.js'
import { QueryBuilder } from '../../query/query/query.js'
import { createQueryValueFilter } from '../../query/filters/factory.js'
import { normalizeLogicalFilter } from '../../query/filters/logical.js'
import { SchemaRegistry } from '../../schema/schema/registry.js'
import { UltimaBase } from '../application/ultima-base.js'
import {
	createInversePointerTargetLookup,
	createInversePointerUpdate,
	createRelationTargetLookup,
} from './relation-mutation.js'

const OptionalPost = UltimaBase.Schema.define({
	className: 'OptionalRelationMutationPost',
	fields: (field) => ({ author: field.pointer({ target: 'RelationAuthor' }) }),
})
new SchemaRegistry([
	RelationAuthor,
	RelationPost,
	OptionalPost,
]).resolveSchemaTargets()

const author = RelationAuthor.pointer('0198f090-2a50-7000-8000-000000000081')
const post = OptionalPost.pointer('0198f090-2a50-7000-8000-000000000082')

describe('internal relation operation construction', () => {
	it('keeps exact target lookup identity outside the neutral public AST', () => {
		const lookup = createRelationTargetLookup(post)

		expect(lookup.operation).toStrictEqual({
			kind: 'find-one',
			query: new QueryBuilder(OptionalPost).ast,
		})
		expect(lookup.rowFilter).toStrictEqual(
			createQueryValueFilter(OptionalPost, 'equal', 'id', post.id),
		)
		expect(JSON.stringify(lookup.operation)).not.toContain(post.id)
		expect(Object.isFrozen(lookup.operation.query)).toBe(true)
	})

	it('keeps inverse membership outside the neutral target lookup AST', () => {
		const lookup = createInversePointerTargetLookup(
			OptionalPost,
			'author',
			author,
		)

		expect(lookup.operation).toStrictEqual({
			kind: 'find-many',
			query: new QueryBuilder(OptionalPost).ast,
		})
		expect(lookup.rowFilter).toStrictEqual(
			createQueryValueFilter(OptionalPost, 'equal', 'author', author),
		)
		expect(JSON.stringify(lookup.operation)).not.toContain(author.id)
	})

	it.each(['connect', 'disconnect'] as const)(
		'keeps private identity and disconnect ownership for %s',
		(action) => {
			const update = createInversePointerUpdate(post, 'author', author, action)
			const idFilter = createQueryValueFilter(
				OptionalPost,
				'equal',
				'id',
				post.id,
			)
			const ownerFilter = createQueryValueFilter(
				OptionalPost,
				'equal',
				'author',
				author,
			)

			expect(update.operation).toStrictEqual({
				kind: 'update-one',
				query: new QueryBuilder(OptionalPost).ast,
				update: {
					kind: 'update-expression',
					operations: [
						{
							kind: 'set',
							field: 'author',
							value: action === 'connect' ? author : null,
						},
					],
				},
			})
			expect(update.rowFilter).toStrictEqual(
				action === 'connect'
					? idFilter
					: normalizeLogicalFilter({
							kind: 'and',
							expressions: [idFilter, ownerFilter],
						}),
			)
			expect(Object.isFrozen(update.operation.query)).toBe(true)
		},
	)

	it('still rejects disconnecting an inverse required pointer', () => {
		expect(() =>
			createInversePointerUpdate(
				RelationPost.pointer(post.id),
				'author',
				author,
				'disconnect',
			),
		).toThrow('Inverse pointer disconnect requires an optional mapped field')
	})
})
