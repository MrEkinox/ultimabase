import { accessPlugin } from '@ultimabase/access-plugin'
import { password } from '@ultimabase/auth-password'
import { authPlugin } from '@ultimabase/auth-plugin'
import {
	getRequestPrincipal,
	UltimaBase,
	type Pointer,
	type Principal,
} from '@ultimabase/core'
import { RequestContext } from '@ultimabase/core/plugin'

// ADR-0340: the User schema of `authPlugin` types the request principal, with
// `Register` naming only the application. Access rules of the User and of the
// schemas it points to read the principal inside the registered application.
export const App = UltimaBase.use(
	accessPlugin(),
	authPlugin({ methods: [password({ identifier: 'email' })] }),
)

export const Member = App.UserSchema.define({
	className: 'Member',
	fields: (field) => ({ displayName: field.string({ required: true }) }),
}).with({
	access: {
		read: ({ principal }) => principal !== undefined,
		update: ({ principal, where }) => where.eq('id', principal?.id ?? 'nobody'),
	},
})

export const Note = App.Schema.define({
	className: 'Note',
	fields: (field) => ({
		author: field.pointer({ target: () => Member, required: true }),
		body: field.string({ required: true }),
	}),
}).with({
	access: {
		create: ({ principal }) => {
			const member: Pointer<'Member'> | undefined = principal
			return member !== undefined
		},
		read: ({ principal, where }) =>
			where.eq('author', principal?.id ?? 'nobody'),
	},
})

export const ultimabase = new App({ schemas: [Member, Note] })

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}

export const principal: Pointer<'Member'> | undefined =
	await getRequestPrincipal(
		RequestContext.anonymous({ requestId: 'cycle', source: 'internal' }),
	)
export const className: 'Member' | undefined = principal?.schema.className
export const exact: Principal = Member.pointer('x')
