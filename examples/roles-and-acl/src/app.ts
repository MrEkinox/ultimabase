// The application: a GraphQL API over HTTP, with sign-in, roles and ACLs.
import { aclPlugin } from '@ultimabase/acl'
import { authPlugin } from '@ultimabase/auth'
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { passwordPlugin } from '@ultimabase/password'
import { rolesPlugin } from '@ultimabase/roles'
import { defineApp, memory } from 'ultimabase'
import { myRoles, shareNote } from './functions.ts'
import { Note, Role, User } from './models.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	//#region plugins
	plugins: [
		// Listens on PORT, or 3000.
		httpPlugin(),
		graphqlPlugin(),
		authPlugin(),
		passwordPlugin({ signUp: ['name'] }),
		// Reads each signed-in user's roles once per request.
		rolesPlugin(),
		aclPlugin(),
	],
	//#endregion
	models: [Role, User, Note],
	functions: [shareNote, myRoles],
})
