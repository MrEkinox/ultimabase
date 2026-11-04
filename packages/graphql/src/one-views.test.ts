// A `one` view over GraphQL (D-240): a nullable field with no arguments, in
// no data input and no `orderBy`.
import type { GraphQLSchema } from 'graphql'
import {
	isInputObjectType,
	isNullableType,
	isObjectType,
	printType,
} from 'graphql'
import { allow, defineModel, memory } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { graphql } from './index.ts'
import { M, post, started } from './test/app.ts'

const Writer = defineModel({
	name: 'Writer',
	use: [graphql()],
	fields: (f) => ({
		name: f.string({ unique: true }),
		notes: f.many(() => Note, { inverse: 'writer' }),
		pinned: f.one(() => Note, { from: 'notes' }),
	}),
}).with({
	access: allow.public,
	relations: { pinned: { where: ({ where }) => where({ pinned: true }) } },
})

const Note = defineModel({
	name: 'Note',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		pinned: f.boolean({ default: false }),
		writer: f.one(() => Writer),
	}),
	indexes: [{ fields: ['writer'], unique: true, where: { pinned: true } }],
}).with({ access: allow.public })

let schema: GraphQLSchema | undefined
let running: Awaited<ReturnType<typeof started>>
beforeAll(async () => {
	running = await started(
		{
			extend: (generated) => {
				schema = generated
				return generated
			},
		},
		memory(),
		[],
		[],
		[Writer, Note],
	)
	await Writer.create(
		{
			data: {
				name: 'Ada',
				notes: { create: [{ title: 'Top', pinned: true }, { title: 'Other' }] },
			},
		},
		M,
	)
	await Writer.create({ data: { name: 'Bob' } }, M)
})
afterAll(async () => running.app.stop())

const keysOf = (name: string): string[] => {
	const type = schema?.getType(name)
	return isInputObjectType(type) ? Object.keys(type.getFields()) : []
}

describe('a one view over GraphQL', () => {
	it('is a nullable field with no arguments', async () => {
		const writer = schema?.getType('Writer')
		const pinned = isObjectType(writer)
			? writer.getFields()['pinned']
			: undefined
		expect(pinned?.args).toEqual([])
		expect(pinned !== undefined && isNullableType(pinned.type)).toBe(true)
		expect(isObjectType(writer) && printType(writer)).toContain(
			'pinned: Note\n',
		)
		const read = await post(
			`${running.url}/graphql`,
			`{ writers(orderBy: { name: asc }) { edges { node { name pinned { title } } } } }`,
		)
		expect(read).toStrictEqual({
			data: {
				writers: {
					edges: [
						{ node: { name: 'Ada', pinned: { title: 'Top' } } },
						{ node: { name: 'Bob', pinned: null } },
					],
				},
			},
		})
	})

	it('is in no data input and no orderBy', () => {
		for (const name of ['WriterCreateInput', 'WriterUpdateInput']) {
			expect(keysOf(name)).toContain('notes')
			expect(keysOf(name)).not.toContain('pinned')
		}
		expect(keysOf('WriterOrderByInput')).toContain('notes')
		expect(keysOf('WriterOrderByInput')).not.toContain('pinned')
		expect(keysOf('WriterWhereInput')).toContain('pinned')
	})
})
