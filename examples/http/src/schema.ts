import { App } from './app.ts'

/**
 * Saved links, served by REST under `/api/classes/Link`. Everyone reads
 * them; without a write rule, only Master requests write.
 */
export const Link = App.Schema.define({
	className: 'Link',
	fields: (field) => ({
		url: field.string({ required: true }),
		title: field.string(),
	}),
}).with({ access: { read: true } })
