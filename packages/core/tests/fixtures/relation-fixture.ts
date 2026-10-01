import { UltimaBase } from '../../src/runtime/application/ultima-base.js'
import { SchemaRegistry } from '../../src/schema/schema/registry.js'

/** Declares one inverse one-to-many topology without pretending Typegen ran. */
export const RelationAuthor = UltimaBase.Schema.define({
	className: 'RelationAuthor',
	fields: (field) => ({
		posts: field.relation({
			target: 'RelationPost',
			mappedBy: 'author',
		}),
	}),
})

export const RelationPost = UltimaBase.Schema.define({
	className: 'RelationPost',
	fields: (field) => ({
		author: field.pointer({
			target: 'RelationAuthor',
			required: true,
		}),
	}),
})

new SchemaRegistry([RelationAuthor, RelationPost]).resolveSchemaTargets()

/** Declares one many-to-many topology without adding a generated test contract. */
export const RelationArticle = UltimaBase.Schema.define({
	className: 'RelationArticle',
	fields: (field) => ({
		tags: field.relation({ target: 'RelationTag' }),
	}),
})

export const RelationTag = UltimaBase.Schema.define({
	className: 'RelationTag',
	fields: (field) => ({
		articles: field.relation({
			target: 'RelationArticle',
			mappedBy: 'tags',
		}),
	}),
})

new SchemaRegistry([RelationArticle, RelationTag]).resolveSchemaTargets()
