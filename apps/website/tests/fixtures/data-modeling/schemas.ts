import { Schema } from '@ultimabase/core'

export const Article = Schema.define({
	className: 'DocsArticle',
	fields: (field) => ({
		published: field.boolean({ default: false }),
		slug: field.string({ indexed: 'unique', required: true }),
		title: field.string({ required: true }),
	}),
})
