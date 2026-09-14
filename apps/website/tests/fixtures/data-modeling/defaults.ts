import { Schema } from '@ultimabase/core'

export const Publication = Schema.define({
	className: 'DocsPublication',
	fields: (field) => ({
		publishedAt: field.dateTime({ autoNow: true }),
		status: field.string({ default: 'draft' }),
		summary: field.string(),
		title: field.string({ required: true }),
	}),
})
