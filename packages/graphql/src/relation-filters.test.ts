// Filtered relations over GraphQL (D-151): a filtered `many` takes no `set`
// in the generated inputs, the others keep it; a view is read, not written.
import { httpPlugin } from '@ultimabase/http'
import type { GraphQLSchema } from 'graphql'
import { isInputObjectType, isObjectType } from 'graphql'
import type { Logger } from 'ultimabase'
import { allow, defineApp, defineModel, memory } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { graphql, graphqlPlugin } from './index.ts'

const Writer = defineModel({
	name: 'Writer',
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		notes: f.many(() => Note),
		drafts: f.many(() => Note, { from: 'notes' }),
		labels: f.many(() => Label),
	}),
}).with({
	access: allow.public,
	relations: {
		notes: { where: ({ where }) => where({ published: true }) },
		drafts: { where: ({ where }) => where({ published: false }) },
	},
})

const Note = defineModel({
	name: 'Note',
	use: [graphql()],
	fields: (f) => ({
		published: f.boolean(),
		writer: f.one(() => Writer, { optional: true }),
	}),
}).with({ access: allow.public })

const Label = defineModel({
	name: 'Label',
	use: [graphql()],
	fields: (f) => ({ writer: f.one(() => Writer, { optional: true }) }),
}).with({ access: allow.public })

const quiet: Logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => quiet,
}

let schema: GraphQLSchema | undefined
const app = defineApp({
	database: memory(),
	plugins: [
		httpPlugin({ port: 0 }),
		graphqlPlugin({
			extend: (generated) => {
				schema = generated
				return generated
			},
		}),
	],
	models: [Writer, Note, Label],
	logger: quiet,
})

const keysOf = (name: string): string[] => {
	const type = schema?.getType(name)
	return isInputObjectType(type) ? Object.keys(type.getFields()) : []
}

describe('a filtered relation over GraphQL', () => {
	beforeAll(async () => app.start())
	afterAll(async () => app.stop())

	it('takes no set, unlike the others', () => {
		expect(keysOf('NoteUpdateManyWithoutWriterNestedInput')).toEqual([
			'connect',
			'connectOrCreate',
			'create',
			'delete',
			'disconnect',
			'update',
		])
		expect(keysOf('LabelUpdateManyWithoutWriterNestedInput')).toContain('set')
	})

	it('reads a view and writes none', () => {
		const writer = schema?.getType('Writer')
		expect(isObjectType(writer) && writer.getFields()['drafts']).toBeTruthy()
		for (const name of ['WriterCreateInput', 'WriterUpdateInput']) {
			expect(keysOf(name)).toContain('notes')
			expect(keysOf(name)).not.toContain('drafts')
		}
	})
})
