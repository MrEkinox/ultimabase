// A team's projects and their tasks: rights that follow from the data, a
// project's members and its owner, with no role to keep in step.
//#region projects
import { graphql } from '@ultimabase/graphql'
import { PublicError, allow, defineModel } from 'ultimabase'
import type { Caller } from 'ultimabase'

/** The caller's user id, or `undefined` for anyone else. */
const userId = (caller: Caller) =>
	caller.kind === 'user' ? caller.user.id : undefined

export const Person = defineModel({
	name: 'Person',
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		projects: f.many(() => Project, { inverse: 'members' }),
		owned: f.many(() => Project, { inverse: 'owner' }),
	}),
}).with({ access: allow.readOnly })

export const Project = defineModel({
	name: 'Project',
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		owner: f.one(() => Person, { inverse: 'owned' }),
		members: f.many(() => Person, { inverse: 'projects' }),
		tasks: f.many(() => Task),
	}),
}).with({
	access: {
		// Its members read a project, through the relation to the caller.
		read: ({ caller, where }) =>
			caller.kind === 'user' &&
			where({ members: { some: { id: caller.user.id } } }),
		// A rule sees the row's own `one` relations as `{ id }`: enough here.
		update: ({ caller, record }) => record.owner.id === userId(caller),
	},
})

export const Task = defineModel({
	name: 'Task',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		done: f.boolean({ default: false }),
		project: f.one(() => Project, { onDelete: 'cascade' }),
	}),
}).with({
	access: {
		// The members of its project read a task, one relation further.
		read: ({ caller, where }) =>
			caller.kind === 'user' &&
			where({
				project: { is: { members: { some: { id: caller.user.id } } } },
			}),
		// Only the project's owner writes its tasks: the row matches the
		// filter before an update or a delete, and after a create or an
		// update, so no task moves to a project of someone else's.
		write: ({ caller, where }) =>
			caller.kind === 'user' &&
			where(
				{ project: { is: { owner: { is: { id: caller.user.id } } } } },
				new PublicError(
					'NOT_PROJECT_OWNER',
					'Only the project’s owner writes its tasks.',
				),
			),
	},
})
//#endregion
