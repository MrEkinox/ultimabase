import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

export const App = UltimaBase.use(
	accessPlugin(),
	softDeletePlugin(),
	rolesPlugin(),
)

export const Member = App.Schema.define({
	className: 'Member',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({
	access: { read: true },
})

// A role schema takes feature keys and indexes over its own fields, the
// factory's fields and the feature fields; its behaviour goes to
// `plugins.roles({ … })` (ADR-0339).
export const TeamRole = App.RoleSchema.define({
	className: 'TeamRole',
	members: () => Member,
	fields: (field) => ({ team: field.string({ required: true }) }),
	softDelete: true,
	indexes: [
		{ fields: ['team', 'name'], unique: true },
		{ fields: ['team'], where: { isDeleted: false } },
	],
}).with({
	roles: {
		ensure: ['lead'],
		deletion: 'cascade',
		resolveCurrent: ({ context }) =>
			context.requestId === '' ? undefined : Member.pointer('member-id'),
	},
	access: { read: true },
})

export const ultimabase = new App({ schemas: [Member, TeamRole] })

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}

export const byTeam = await TeamRole.updateOne({
	where: { team: 'a', name: 'lead' },
	data: { team: 'b' },
})
export const lead = TeamRole.role('lead')
export const removed = await TeamRole.softDeleteOne({ id: 'x' })
