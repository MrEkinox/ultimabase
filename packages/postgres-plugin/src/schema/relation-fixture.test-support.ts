import { Schema, type SchemaReference } from '@ultimabase/core'

export type PostgresRelationArticleSchema =
	SchemaReference<'PostgresRelationArticle'>
export type PostgresRelationTagSchema = SchemaReference<'PostgresRelationTag'>

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

export type PostgresRelationAuthorSchema =
	SchemaReference<'PostgresRelationAuthor'>
export type PostgresRelationPostSchema = SchemaReference<'PostgresRelationPost'>

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
