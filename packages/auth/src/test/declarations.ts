// An application that emits declarations without isolatedDeclarations
// (D-70): what it exports names the plugin's types, which must be exported.
import { authPlugin, defineUser } from '@ultimabase/auth'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'

export const User = defineUser({
	name: 'User',
	fields: (f) => ({ email: f.string({ unique: true }) }),
})

export const app = defineApp({
	database: memory(),
	plugins: [httpPlugin(), authPlugin()],
	models: [User],
})
