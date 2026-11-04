// `viewer` in the generated filters (D-189): on a relation to the user
// model only, read by the kernel with the caller.
import { httpPlugin } from '@ultimabase/http'
import type { GraphQLSchema } from 'graphql'
import { printType } from 'graphql'
import type { Logger } from 'ultimabase'
import { allow, defineApp, defineModel, definePlugin, memory } from 'ultimabase'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { graphql, graphqlPlugin } from './index.ts'

const users = definePlugin({ name: 'users', userModel: true })

const Member = defineModel({
	name: 'Member',
	use: [users.use(), graphql()],
	fields: (f) => ({
		name: f.string(),
		notes: f.many(() => Note, { inverse: 'author' }),
	}),
}).with({ access: allow.readOnly })

const Note = defineModel({
	name: 'Note',
	use: [graphql()],
	fields: (f) => ({ author: f.one(() => Member) }),
}).with({ access: allow.readOnly })

let schema: GraphQLSchema | undefined
const logger: Logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => logger,
}
const app = defineApp({
	database: memory(),
	plugins: [
		httpPlugin({ port: 0 }),
		users.plugin(),
		graphqlPlugin({
			extend: (generated) => {
				schema = generated
				return generated
			},
		}),
	],
	models: [Member, Note],
	logger,
})
beforeAll(async () => app.start())
afterAll(async () => app.stop())

const typeOf = (name: string): string => {
	const type = schema?.getType(name)
	return type === undefined ? 'none' : printType(type)
}

it('filters a relation to the user model by the caller', () => {
	expect(typeOf('MemberRelationFilter')).toContain('  viewer: Boolean\n')
	expect(typeOf('NoteListRelationFilter')).not.toContain('viewer')
})
