import { App } from '../../lib-registry-check/core.ts'

export const Todo = App.Schema.define({
	className: 'Todo',
	fields: {
		title: 'string',
		archived: 'boolean = false',
		assignee: 'TodoUser?',
		parent: 'Todo?',
		subtasks: 'Todo[] by parent',
		tags: 'Tag[]',
	},
})
