// A project's tasks, the tables the migrations create.
import { graphql } from '@ultimabase/graphql'
import { allow, defineModel } from 'ultimabase'

//#region models
export const Project = defineModel({
	name: 'Project',
	use: [graphql()],
	fields: (f) => ({
		name: f.string({ unique: true }),
		tasks: f.many(() => Task),
	}),
	// Open to every client, to keep the example on the database.
}).with({ access: allow.public })

export const Task = defineModel({
	name: 'Task',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		done: f.boolean({ default: false }),
		// Added after the first migration: the second one adds its column.
		priority: f.number({ integer: true, default: 0 }),
		// A project's tasks are deleted with it.
		project: f.one(() => Project, { onDelete: 'cascade' }),
	}),
}).with({ access: allow.public })
//#endregion
