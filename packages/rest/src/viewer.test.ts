// `viewer` in the document's filters (D-189): on a relation to the user
// model only, named as GraphQL's (D-129).
import { httpPlugin } from '@ultimabase/http'
import type { Logger } from 'ultimabase'
import { allow, defineApp, defineModel, definePlugin, memory } from 'ultimabase'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { rest, restPlugin } from './index.ts'
import { at, call } from './test/app.ts'

const users = definePlugin({ name: 'users', userModel: true })

const Member = defineModel({
	name: 'Member',
	use: [users.use(), rest()],
	fields: (f) => ({ name: f.string(), notes: f.many(() => Note) }),
}).with({ access: allow.readOnly })

const Note = defineModel({
	name: 'Note',
	use: [rest()],
	fields: (f) => ({ author: f.one(() => Member) }),
}).with({ access: allow.readOnly })

const lines: unknown[] = []
const logger: Logger = {
	info: (first) => {
		lines.push(first)
	},
	warn: () => {},
	error: () => {},
	child: () => logger,
}
const app = defineApp({
	database: memory(),
	plugins: [httpPlugin({ port: 0 }), users.plugin(), restPlugin()],
	models: [Member, Note],
	logger,
})
let url = ''
beforeAll(async () => {
	await app.start()
	const line = lines.find(
		(first) => typeof first === 'string' && first.startsWith('Listening on'),
	)
	url = String(line).replace(/^Listening on (.*)\.$/, '$1')
})
afterAll(async () => app.stop())

it('filters a relation to the user model by the caller', async () => {
	const { body } = await call(url, 'GET', '/api/openapi.json')
	const filter = (name: string) =>
		at(body, 'components', 'schemas', name, 'properties')
	expect(at(filter('MemberRelationFilter'), 'viewer')).toStrictEqual({
		type: 'boolean',
	})
	expect(filter('NoteListRelationFilter')).not.toHaveProperty('viewer')
})
