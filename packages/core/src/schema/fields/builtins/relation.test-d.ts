import { expectTypeOf, test } from 'vitest'

import {
	relationField,
	Schema,
	SchemaRegistry,
	SchemaRelationMappingError,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
	type RelationField,
	type ResolvedSchemaRelation,
} from '../../index.js'
import {
	RelationArticle,
	RelationAuthor,
	RelationPost,
	RelationTag,
} from './relation-fixture.test-support.js'

test('preserves exact owning and inverse targets without row values', () => {
	type AuthorObject = InferObject<typeof RelationAuthor>
	type AuthorCreate = InferCreateInput<typeof RelationAuthor>
	type AuthorUpdate = InferUpdateInput<typeof RelationAuthor>
	type ArticleObject = InferObject<typeof RelationArticle>

	expectTypeOf(RelationAuthor.fields.posts).toEqualTypeOf<
		RelationField<typeof RelationPost, 'author'>
	>()
	expectTypeOf(RelationArticle.fields.tags).toEqualTypeOf<
		RelationField<typeof RelationTag, undefined>
	>()
	expectTypeOf(RelationTag.fields.articles).toEqualTypeOf<
		RelationField<typeof RelationArticle, 'tags'>
	>()
	expectTypeOf<AuthorObject>().not.toHaveProperty('posts')
	expectTypeOf<AuthorCreate>().not.toHaveProperty('posts')
	expectTypeOf<AuthorUpdate>().not.toHaveProperty('posts')
	expectTypeOf<ArticleObject>().not.toHaveProperty('tags')
	const graph = new SchemaRegistry([
		RelationAuthor,
		RelationPost,
		RelationArticle,
		RelationTag,
	]).resolveSchemaTargets()

	expectTypeOf(graph.getRelation(RelationAuthor, ['posts'])).toEqualTypeOf<
		ResolvedSchemaRelation | undefined
	>()
	expectTypeOf(graph.relations()).toEqualTypeOf<
		readonly ResolvedSchemaRelation[]
	>()
})

test('restricts mappedBy to compatible target relationship fields', () => {
	const Target = Schema.define({ className: 'RelationTypeTarget', fields: {} })

	relationField({ target: () => RelationPost, mappedBy: 'author' })
	relationField({ target: () => RelationArticle, mappedBy: 'tags' })

	// @ts-expect-error -- Scalar fields cannot own inverse relation storage.
	relationField({ target: () => RelationPost, mappedBy: 'title' })
	// @ts-expect-error -- The target has no relationship field with this name.
	relationField({ target: () => Target, mappedBy: 'missing' })
	// @ts-expect-error -- Relation collections are never embedded list fields.
	relationField({ target: () => Target, list: true })
	// @ts-expect-error -- Relation collections do not accept scalar defaults.
	relationField({ target: () => Target, default: [] })
})

test('exports stable relation mapping diagnostics', () => {
	const error = new SchemaRelationMappingError(
		'missing-mapped-field',
		RelationAuthor,
		['posts'],
		RelationPost,
		'Missing mapping',
		'author',
	)

	expectTypeOf(error.code).toEqualTypeOf<'SCHEMA_RELATION_MAPPING_FAILED'>()
	expectTypeOf(error.sourceClassName).toEqualTypeOf<string>()
	expectTypeOf(error.fieldPath).toEqualTypeOf<readonly string[]>()
	expectTypeOf(error.mappedBy).toEqualTypeOf<string | undefined>()
})
