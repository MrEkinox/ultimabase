import { Schema, type SchemaReference } from '@ultimabase/core'

export type PostgresRelationArticleSchema =
	SchemaReference<'PostgresRelationArticle'>
export type PostgresRelationTagSchema = SchemaReference<'PostgresRelationTag'>

/** Provides one owning and inverse join topology to PostgreSQL unit tests. */
export const PostgresRelationArticle: PostgresRelationArticleSchema =
	Schema.define({
		className: 'PostgresRelationArticle',
		fields: (field) => ({
			tags: field.relation({ target: 'PostgresRelationTag' }),
		}),
	})

export const PostgresRelationTag: PostgresRelationTagSchema = Schema.define({
	className: 'PostgresRelationTag',
	fields: (field) => ({
		articles: field.relation({
			target: 'PostgresRelationArticle',
			mappedBy: 'tags',
		}),
	}),
})

export type PostgresRelationAuthorSchema =
	SchemaReference<'PostgresRelationAuthor'>
export type PostgresRelationPostSchema = SchemaReference<'PostgresRelationPost'>

/** Provides one inverse-pointer topology without creating join storage. */
export const PostgresRelationAuthor: PostgresRelationAuthorSchema =
	Schema.define({
		className: 'PostgresRelationAuthor',
		fields: (field) => ({
			posts: field.relation({
				target: 'PostgresRelationPost',
				mappedBy: 'author',
			}),
		}),
	})

export const PostgresRelationPost: PostgresRelationPostSchema = Schema.define({
	className: 'PostgresRelationPost',
	fields: (field) => ({
		author: field.pointer({
			target: 'PostgresRelationAuthor',
			validation: { required: true },
		}),
	}),
})
