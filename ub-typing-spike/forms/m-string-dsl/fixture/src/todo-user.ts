import { App } from '../../lib/core.ts'

export const TodoUser = App.Schema.define({
	className: 'TodoUser',
	fields: {
		displayName: 'string',
		email: 'string',
		assignedTodos: 'Todo[] by assignee',
	},
})
