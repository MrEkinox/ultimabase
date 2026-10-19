import { App } from '../../lib-registry-check/core.ts'

export const Tag = App.Schema.define({
	className: 'Tag',
	fields: { name: 'string', todos: 'Todo[] by tags' },
})
