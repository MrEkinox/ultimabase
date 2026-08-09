import {
	Schema,
	type PointerField,
	type RelationField,
	type ScalarFieldInferenceState,
	type SchemaClass,
} from '@ultimabase/core'

type RequiredPointerState = ScalarFieldInferenceState<true, false, false, false>

export type PostgresRelationArticleSchema = SchemaClass<
	'PostgresRelationArticle',
	Readonly<{
		readonly tags: RelationField<PostgresRelationTagSchema, undefined>
	}>,
	readonly []
>

export type PostgresRelationTagSchema = SchemaClass<
	'PostgresRelationTag',
	Readonly<{
		readonly articles: RelationField<PostgresRelationArticleSchema, 'tags'>
	}>,
	readonly []
>

function resolveTag(): PostgresRelationTagSchema {
	return PostgresRelationTag
}

/** Provides one owning and inverse join topology to PostgreSQL unit tests. */
export const PostgresRelationArticle: PostgresRelationArticleSchema =
	Schema.define({
		className: 'PostgresRelationArticle',
		fields: (field) => ({ tags: field.relation({ target: resolveTag }) }),
	})

export const PostgresRelationTag: PostgresRelationTagSchema = Schema.define({
	className: 'PostgresRelationTag',
	fields: (field) => ({
		articles: field.relation({
			target: (): PostgresRelationArticleSchema => PostgresRelationArticle,
			mappedBy: 'tags',
		}),
	}),
})

export type PostgresRelationAuthorSchema = SchemaClass<
	'PostgresRelationAuthor',
	Readonly<{
		readonly posts: RelationField<PostgresRelationPostSchema, 'author'>
	}>,
	readonly []
>

export type PostgresRelationPostSchema = SchemaClass<
	'PostgresRelationPost',
	Readonly<{
		readonly author: PointerField<
			PostgresRelationAuthorSchema,
			RequiredPointerState
		>
	}>,
	readonly []
>

function resolvePost(): PostgresRelationPostSchema {
	return PostgresRelationPost
}

/** Provides one inverse-pointer topology without creating join storage. */
export const PostgresRelationAuthor: PostgresRelationAuthorSchema =
	Schema.define({
		className: 'PostgresRelationAuthor',
		fields: (field) => ({
			posts: field.relation({ target: resolvePost, mappedBy: 'author' }),
		}),
	})

export const PostgresRelationPost: PostgresRelationPostSchema = Schema.define({
	className: 'PostgresRelationPost',
	fields: (field) => ({
		author: field.pointer({
			target: (): PostgresRelationAuthorSchema => PostgresRelationAuthor,
			validation: { required: true },
		}),
	}),
})
