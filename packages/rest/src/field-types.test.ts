// Plugin field types over REST (D-122): read as `toJSON` gives, described
// by their shape when they give one (D-152), any JSON otherwise.
import { httpPlugin } from '@ultimabase/http'
import type { Logger, PluginTypes } from 'ultimabase'
import {
	allow,
	defineApp,
	defineFieldType,
	defineModel,
	definePlugin,
	memory,
} from 'ultimabase'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { z } from 'zod'
import { rest, restPlugin } from './index.ts'
import { asMaster, at, call } from './test/app.ts'

interface Places extends PluginTypes {
	readonly name: 'places'
}
const places = definePlugin<Places>({
	name: 'places',
	manifest: {
		name: 'test-places',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
})

const pair = z.tuple([z.number(), z.number()])

/** A place code reads as a tuple and clients as its shape says. */
const place = defineFieldType({
	plugin: 'places',
	stored: (f) => f.json(),
	decode: (stored) => pair.parse(stored),
	encode: (value) => value,
	schema: pair,
	toJSON: ([lat, lng]) => ({ lat, lng }),
	shape: z.object({ lat: z.number(), lng: z.number() }),
})

/** The same place, without a shape. */
const loose = defineFieldType({
	plugin: 'places',
	stored: (f) => f.json(),
	decode: (stored) => pair.parse(stored),
	encode: (value) => value,
	schema: pair,
	toJSON: ([lat, lng]) => ({ lat, lng }),
})

const Spot = defineModel({
	name: 'Spot',
	use: [rest()],
	fields: () => ({ here: place(), there: loose() }),
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
	plugins: [httpPlugin({ port: 0 }), places.plugin(), restPlugin()],
	models: [Spot],
	masterKey: 'secret',
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

it('reads its toJSON', async () => {
	const created = await call(url, 'POST', '/api/spots', {
		body: { here: [1, 2], there: [3, 4] },
		headers: asMaster,
	})
	expect(at(created.body, 'here')).toStrictEqual({ lat: 1, lng: 2 })
	expect(at(created.body, 'there')).toStrictEqual({ lat: 3, lng: 4 })
})

it('is described by its shape when read, any JSON when written', async () => {
	const { body } = await call(url, 'GET', '/api/openapi.json')
	const schema = (name: string) => at(body, 'components', 'schemas', name)
	expect(at(schema('Spot'), 'properties', 'here')).toStrictEqual({
		type: 'object',
		properties: { lat: { type: 'number' }, lng: { type: 'number' } },
		required: ['lat', 'lng'],
		additionalProperties: false,
	})
	expect(at(schema('Spot'), 'properties', 'there')).toStrictEqual({})
	expect(at(schema('SpotCreateInput'), 'properties', 'here')).toStrictEqual({})
})
