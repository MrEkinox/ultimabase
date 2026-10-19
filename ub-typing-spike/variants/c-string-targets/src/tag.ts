import { App } from './factory.ts'

export const Tag = App.Schema.declare({
	className: 'Tag',
	fields: (field) => ({
		label: field.string({ required: true }),
		todos: field.relation({ target: 'Todo', mappedBy: 'tags' }),
	}),
}).with({ access: { read: true } })
