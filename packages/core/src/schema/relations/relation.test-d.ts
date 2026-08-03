import { expectTypeOf, test } from 'vitest'

import type { Query } from '../../query/query/query.js'
import type {
	RelationArticle,
	RelationAuthor,
	RelationPost,
	RelationTag,
} from '../fields/builtins/relation-fixture.test-support.js'
import type { SchemaResult } from '../schema/model.js'
import type {
	Relation,
	SchemaRelationFieldName,
	SchemaRelationTarget,
} from './relation.js'

test('infers exact owning and inverse relation handles from persisted models', () => {
	const article = null as unknown as SchemaResult<typeof RelationArticle>
	const tag = null as unknown as SchemaResult<typeof RelationTag>
	const author = null as unknown as SchemaResult<typeof RelationAuthor>
	const selectedArticle = null as unknown as SchemaResult<
		typeof RelationArticle,
		Readonly<{ readonly id: string }>
	>

	expectTypeOf(article.relation('tags')).toEqualTypeOf<
		Relation<typeof RelationArticle, typeof RelationTag>
	>()
	expectTypeOf(tag.relation('articles')).toEqualTypeOf<
		Relation<typeof RelationTag, typeof RelationArticle>
	>()
	expectTypeOf(author.relation('posts')).toEqualTypeOf<
		Relation<typeof RelationAuthor, typeof RelationPost>
	>()
	expectTypeOf(selectedArticle.relation('tags')).toEqualTypeOf<
		Relation<typeof RelationArticle, typeof RelationTag>
	>()
	expectTypeOf(article.relation('tags').query()).toEqualTypeOf<
		Query<typeof RelationTag>
	>()
	expectTypeOf(article.toJSON()).not.toHaveProperty('tags')

	// @ts-expect-error -- Only declared relation fields are accepted.
	article.relation('missing')
	const post = null as unknown as SchemaResult<typeof RelationPost>
	expectTypeOf(post).not.toHaveProperty('relation')
	expectTypeOf<InstanceType<typeof RelationArticle>>().not.toHaveProperty(
		'relation',
	)
	type PubliclyConstructible<TValue> = TValue extends new (
		...arguments_: unknown[]
	) => unknown
		? true
		: false
	expectTypeOf<PubliclyConstructible<typeof Relation>>().toEqualTypeOf<false>()
})

test('publishes compact helpers for relation-field and target inference', () => {
	expectTypeOf<
		SchemaRelationFieldName<typeof RelationArticle>
	>().toEqualTypeOf<'tags'>()
	expectTypeOf<
		SchemaRelationTarget<typeof RelationArticle, 'tags'>
	>().toEqualTypeOf<typeof RelationTag>()
})
