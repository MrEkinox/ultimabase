import type { ScalarFieldInferenceState } from '../base/contract.js'
import { type PointerField } from './pointer.js'
import { type RelationField } from './relation.js'
import { Schema, type SchemaClass } from '../../schema/definition.js'

type RequiredPointerState = ScalarFieldInferenceState<true, false, false, false>

/** Exact circular fixture for an inverse one-to-many pointer topology. */
export type RelationAuthorSchema = SchemaClass<
	'RelationAuthor',
	Readonly<{
		readonly posts: RelationField<RelationPostSchema, 'author'>
	}>,
	readonly []
>

/** Exact circular fixture for the owning side of a one-to-many topology. */
export type RelationPostSchema = SchemaClass<
	'RelationPost',
	Readonly<{
		readonly author: PointerField<RelationAuthorSchema, RequiredPointerState>
	}>,
	readonly []
>

function resolveRelationPost(): RelationPostSchema {
	return RelationPost
}

export const RelationAuthor: RelationAuthorSchema = Schema.define({
	className: 'RelationAuthor',
	fields: (field) => ({
		posts: field.relation({ target: resolveRelationPost, mappedBy: 'author' }),
	}),
})

export const RelationPost: RelationPostSchema = Schema.define({
	className: 'RelationPost',
	fields: (field) => ({
		author: field.pointer({
			target: (): RelationAuthorSchema => RelationAuthor,
			validation: { required: true },
		}),
	}),
})

/** Exact circular fixture for one owning many-to-many side. */
export type RelationArticleSchema = SchemaClass<
	'RelationArticle',
	Readonly<{
		readonly tags: RelationField<RelationTagSchema, undefined>
	}>,
	readonly []
>

/** Exact circular fixture for one inverse many-to-many side. */
export type RelationTagSchema = SchemaClass<
	'RelationTag',
	Readonly<{
		readonly articles: RelationField<RelationArticleSchema, 'tags'>
	}>,
	readonly []
>

function resolveRelationTag(): RelationTagSchema {
	return RelationTag
}

export const RelationArticle: RelationArticleSchema = Schema.define({
	className: 'RelationArticle',
	fields: (field) => ({
		tags: field.relation({ target: resolveRelationTag }),
	}),
})

export const RelationTag: RelationTagSchema = Schema.define({
	className: 'RelationTag',
	fields: (field) => ({
		articles: field.relation({
			target: (): RelationArticleSchema => RelationArticle,
			mappedBy: 'tags',
		}),
	}),
})
