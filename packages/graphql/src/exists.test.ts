// An `exists` over GraphQL (D-246): a `Boolean!` with no arguments, a
// `Boolean` in `where`, in no data input and no `orderBy`.
import type { GraphQLSchema } from 'graphql'
import { isInputObjectType, isObjectType, printType } from 'graphql'
import { allow, defineFunction, defineModel, memory } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { graphql } from './index.ts'
import { M, post, started } from './test/app.ts'

const Writer = defineModel({
	name: 'Writer',
	use: [graphql()],
	fields: (f) => ({
		name: f.string({ unique: true }),
		notes: f.many(() => Note, { inverse: 'writer' }),
		hasPinned: f.exists(() => Note, { from: 'notes' }),
	}),
}).with({
	access: allow.public,
	relations: { hasPinned: { where: ({ where }) => where({ pinned: true }) } },
})

const Note = defineModel({
	name: 'Note',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		pinned: f.boolean({ default: false }),
		writer: f.one(() => Writer),
	}),
}).with({ access: allow.public })

// Regression (#210): `run` reads no exists, so the output re-reads it.
const firstWriter = defineFunction({
	name: 'firstWriter',
	query: true,
	output: Writer,
	run: async () => Writer.findFirstOrThrow({ orderBy: { name: 'asc' } }, M),
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
		[firstWriter],
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
	await Writer.create(
		{ data: { name: 'Bob', notes: { create: [{ title: 'Draft' }] } } },
		M,
	)
})
afterAll(async () => running.app.stop())

const keysOf = (name: string): string[] => {
	const type = schema?.getType(name)
	return isInputObjectType(type) ? Object.keys(type.getFields()) : []
}

const names = async (where: string): Promise<unknown> =>
	post(
		`${running.url}/graphql`,
		`{ writers(where: ${where}, orderBy: { name: asc }) { edges { node { name hasPinned } } } }`,
	)

const only = (name: string, hasPinned: boolean) => ({
	data: { writers: { edges: [{ node: { name, hasPinned } }] } },
})

describe('an exists over GraphQL', () => {
	it('is a Boolean! with no arguments', async () => {
		const writer = schema?.getType('Writer')
		const field = isObjectType(writer)
			? writer.getFields()['hasPinned']
			: undefined
		expect(field?.args).toEqual([])
		expect(isObjectType(writer) && printType(writer)).toContain(
			'hasPinned: Boolean!\n',
		)
		expect(await names('{}')).toStrictEqual({
			data: {
				writers: {
					edges: [
						{ node: { name: 'Ada', hasPinned: true } },
						{ node: { name: 'Bob', hasPinned: false } },
					],
				},
			},
		})
	})

	it('filters on a Boolean', async () => {
		expect(await names('{ hasPinned: true }')).toStrictEqual(only('Ada', true))
		expect(await names('{ hasPinned: false }')).toStrictEqual(
			only('Bob', false),
		)
	})

	it('is in no data input and no orderBy', () => {
		for (const name of ['WriterCreateInput', 'WriterUpdateInput']) {
			expect(keysOf(name)).toContain('notes')
			expect(keysOf(name)).not.toContain('hasPinned')
		}
		expect(keysOf('WriterOrderByInput')).toContain('notes')
		expect(keysOf('WriterOrderByInput')).not.toContain('hasPinned')
		const where = schema?.getType('WriterWhereInput')
		expect(isInputObjectType(where) && printType(where)).toContain(
			'hasPinned: Boolean\n',
		)
	})

	it('is re-read in a function output', async () => {
		expect(
			await post(
				`${running.url}/graphql`,
				'{ firstWriter { name hasPinned } }',
			),
		).toStrictEqual({ data: { firstWriter: { name: 'Ada', hasPinned: true } } })
	})
})
