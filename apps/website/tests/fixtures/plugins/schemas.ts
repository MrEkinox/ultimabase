import { Schema } from '@ultimabase/core'

export const Article = Schema.define({
	className: 'PluginGuideArticle',
	fields: (field) => ({ title: field.string({ required: true }) }),
})
