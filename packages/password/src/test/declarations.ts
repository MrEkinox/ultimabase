// An application that emits declarations without isolatedDeclarations
// (D-70): what it exports names the plugin's types, which must be exported.
import { authPlugin, defineUser } from '@ultimabase/auth'
import { httpPlugin } from '@ultimabase/http'
import { password, passwordPlugin } from '@ultimabase/password'
import { defineApp, memory } from 'ultimabase'

export const User = defineUser({
	name: 'User',
	use: [password()],
	fields: (f) => ({ name: f.string() }),
})

export const app = defineApp({
	database: memory(),
	plugins: [httpPlugin(), authPlugin(), passwordPlugin({ signUp: ['name'] })],
	models: [User],
})
