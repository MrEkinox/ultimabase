import { expectTypeOf, test } from 'vitest'

import type { OperationOptions } from '../../query/operations/options.js'
import type { InferQueryResult } from '../../query/query/result.js'
import {
	RelationArticle,
	type RelationAuthor,
	type RelationPost,
	type RelationTag,
} from '../fields/builtins/relation-fixture.test-support.js'
import type { SchemaResult } from '../schema/model.js'
import type { PointerTarget } from './pointer.js'
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
	expectTypeOf(
		article.relation('tags').findMany({ select: { id: true } }),
	).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof RelationTag, 'id'>[]>
	>()
	type ArticleRelation = Relation<typeof RelationArticle, typeof RelationTag>
	type Connect = ArticleRelation['connect']
	type Set = ArticleRelation['set']
	type Clear = ArticleRelation['clear']

	expectTypeOf<Parameters<Connect>[0]>().toEqualTypeOf<
		| PointerTarget<'RelationTag'>
		| readonly [PointerTarget<'RelationTag'>, ...PointerTarget<'RelationTag'>[]]
	>()
	expectTypeOf<Parameters<Connect>[1]>().toEqualTypeOf<
		OperationOptions | undefined
	>()
	expectTypeOf<ReturnType<Connect>>().toEqualTypeOf<Promise<void>>()
	expectTypeOf<Parameters<Set>[0]>().toEqualTypeOf<
		readonly PointerTarget<'RelationTag'>[]
	>()
	expectTypeOf<ReturnType<Clear>>().toEqualTypeOf<Promise<void>>()
	expectTypeOf(article.toJSON()).not.toHaveProperty('tags')

	// @ts-expect-error -- Only declared relation fields are accepted.
	article.relation('missing')
	const post = null as unknown as SchemaResult<typeof RelationPost>
	const articlePointer = RelationArticle.pointer('article-id')
	// @ts-expect-error -- Relation targets retain exact schema identity.
	void article.relation('tags').connect(articlePointer)
	// @ts-expect-error -- Additive mutations require at least one target.
	void article.relation('tags').connect([])
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
