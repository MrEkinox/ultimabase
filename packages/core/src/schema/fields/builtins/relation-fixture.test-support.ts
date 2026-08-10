import { Schema, type SchemaReference } from '../../schema/definition.js'

export type RelationAuthorSchema = SchemaReference<'RelationAuthor'>
export type RelationPostSchema = SchemaReference<'RelationPost'>

function resolveRelationPost(): RelationPostSchema {
	return RelationPost
}

/** Declares one inverse one-to-many topology without pretending codegen ran. */
export const RelationAuthor: RelationAuthorSchema = Schema.define({
	className: 'RelationAuthor',
	fields: (field) => ({
		posts: field.relation({
			target: resolveRelationPost,
			mappedBy: 'author',
		}),
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

export type RelationArticleSchema = SchemaReference<'RelationArticle'>
export type RelationTagSchema = SchemaReference<'RelationTag'>

function resolveRelationTag(): RelationTagSchema {
	return RelationTag
}

/** Declares one many-to-many topology without adding a generated test contract. */
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
