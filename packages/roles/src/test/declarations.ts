// An application that emits declarations without isolatedDeclarations
// (D-70): what it exports names the plugin's types, which must be exported.
import { defineRole, rolesPlugin } from '@ultimabase/roles'
import { defineApp, defineModel, memory } from 'ultimabase'

export const Role = defineRole({ name: 'Role', members: () => User })

export const User = defineModel({
	name: 'User',
	fields: (f) => ({ email: f.string(), roles: f.many(() => Role) }),
})

export const app = defineApp({
	database: memory(),
	plugins: [rolesPlugin()],
	models: [Role, User],
})
