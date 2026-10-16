import { accessPlugin } from '@ultimabase/access-plugin'
import { password } from '@ultimabase/auth-password'
import { authPlugin } from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

export const App = UltimaBase.use(
	accessPlugin(),
	softDeletePlugin(),
	authPlugin({ methods: [password({ identifier: 'email' })] }),
)

// A plugin factory's define takes feature keys and indexes over its own
// fields, the methods' fields and the feature fields (ADR-0339).
export const Member = App.UserSchema.define({
	className: 'Member',
	fields: (field) => ({
		displayName: field.string({ required: true }),
		handle: field.string({ required: true }),
	}),
	softDelete: { mode: 'command' },
	indexes: [
		{ fields: ['handle'], unique: true },
		{ fields: ['email', 'isDeleted'], unique: true },
		{ fields: ['displayName'], unique: true, where: { isDeleted: false } },
	],
}).with({
	access: {
		read: ({ where }) => where.eq('isDeleted', false),
		softDeleteOne: true,
	},
})

export const ultimabase = new App({ schemas: [Member] })

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}

// Complete unique indexes of define are unique targets, own fields included.
export const byHandle = await Member.updateOne({
	where: { handle: 'ada' },
	data: { displayName: 'Ada' },
})
export const byEmail = await Member.updateOne({
	where: { email: 'ada@example.test', isDeleted: false },
	data: { displayName: 'Ada' },
})
export const soft = await Member.softDeleteOne({ id: 'x' })
export const me = await Member.current()
