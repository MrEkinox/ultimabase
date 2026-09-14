import { Schema } from '@ultimabase/core'

export const Task = Schema.define({
	className: 'Task',
	fields: (field) => ({
		done: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
})
