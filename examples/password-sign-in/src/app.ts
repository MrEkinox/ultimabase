// The application: a GraphQL API over HTTP, with sign-up and sign-in.
import { authPlugin } from '@ultimabase/auth'
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { passwordPlugin } from '@ultimabase/password'
import { defineApp, memory } from 'ultimabase'
import { Post, User } from './models.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	plugins: [
		// Listens on PORT, or 3000.
		httpPlugin(),
		graphqlPlugin(),
		authPlugin(),
		// A user signs up with an email, a password and a name.
		passwordPlugin({ signUp: ['name'] }),
	],
	models: [User, Post],
	//#region master-key
	// A request with this key in `x-ultimabase-master-key` acts as Master, so
	// a script can make an editor; unset, no request can.
	masterKey: process.env['MASTER_KEY'],
	//#endregion
})
