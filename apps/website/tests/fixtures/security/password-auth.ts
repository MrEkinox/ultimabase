import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import {
	PasswordUserSchema,
	passwordAuthOperations,
	passwordAuthPlugin,
} from '@ultimabase/password-auth-plugin'

const AppUser = PasswordUserSchema.define({
	className: 'User',
	fields: (field) => ({ displayName: field.string() }),
})

const ultimabase = new UltimaBase({
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'server', value: 'read-from-a-secret-store' }],
		onUse: (event) => {
			console.info('Master use', event.reason)
		},
	}),
	plugins: [passwordAuthPlugin({ user: AppUser })],
	schemas: [],
})

const signedUp = await ultimabase
	.operation(passwordAuthOperations.signUp)
	.execute({
		username: 'Ada',
		password: 'correct horse battery staple',
	})

const auth = ultimabase.application.getPlugin(
	'@ultimabase/password-auth-plugin',
)
await auth.runWithSession(signedUp.session.token, () => AppUser.findMany())
