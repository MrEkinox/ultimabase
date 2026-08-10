import { Schema, type SchemaReference } from '../../schema/definition.js'
import { SchemaRegistry } from '../../schema/registry.js'

export type RelationAuthorSchema = SchemaReference<'RelationAuthor'>
export type RelationPostSchema = SchemaReference<'RelationPost'>

/** Declares one inverse one-to-many topology without pretending codegen ran. */
export const RelationAuthor: RelationAuthorSchema = Schema.define({
	className: 'RelationAuthor',
	fields: (field) => ({
		posts: field.relation({
			target: 'RelationPost',
			mappedBy: 'author',
		}),
	}),
})

export const RelationPost: RelationPostSchema = Schema.define({
	className: 'RelationPost',
	fields: (field) => ({
		author: field.pointer({
			target: 'RelationAuthor',
			validation: { required: true },
		}),
	}),
})

new SchemaRegistry([RelationAuthor, RelationPost]).resolveSchemaTargets()

/** Declares one many-to-many topology without adding a generated test contract. */
export type RelationArticleSchema = SchemaReference<'RelationArticle'>
export type RelationTagSchema = SchemaReference<'RelationTag'>

export const RelationArticle: RelationArticleSchema = Schema.define({
	className: 'RelationArticle',
	fields: (field) => ({
		tags: field.relation({ target: 'RelationTag' }),
	}),
})

export const RelationTag: RelationTagSchema = Schema.define({
	className: 'RelationTag',
	fields: (field) => ({
		articles: field.relation({
			target: 'RelationArticle',
			mappedBy: 'tags',
		}),
	}),
})

new SchemaRegistry([RelationArticle, RelationTag]).resolveSchemaTargets()
