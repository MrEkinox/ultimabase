import { App } from '../../lib/core.ts'

export const Tag = App.Schema.define({
	className: 'Tag',
	fields: { name: 'string', todos: 'Todo[] by tags' },
})
