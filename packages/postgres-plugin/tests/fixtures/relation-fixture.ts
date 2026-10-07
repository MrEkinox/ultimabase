import { UltimaBase } from '@ultimabase/core'

/** Provides one owning and inverse join topology to PostgreSQL unit tests. */
export const PostgresRelationArticle = UltimaBase.Schema.define({
	className: 'PostgresRelationArticle',
	fields: (field) => ({
		tags: field.relation({ target: 'PostgresRelationTag' }),
	}),
})

export const PostgresRelationTag = UltimaBase.Schema.define({
	className: 'PostgresRelationTag',
	fields: (field) => ({
		articles: field.relation({
			target: 'PostgresRelationArticle',
			mappedBy: 'tags',
		}),
	}),
})

/** Provides one inverse-pointer topology without creating join storage. */
export const PostgresRelationAuthor = UltimaBase.Schema.define({
	className: 'PostgresRelationAuthor',
	fields: (field) => ({
		posts: field.relation({
			target: 'PostgresRelationPost',
			mappedBy: 'author',
		}),
	}),
})

export const PostgresRelationPost = UltimaBase.Schema.define({
	className: 'PostgresRelationPost',
	fields: (field) => ({
		author: field.pointer({
			target: 'PostgresRelationAuthor',
			required: true,
		}),
	}),
})
