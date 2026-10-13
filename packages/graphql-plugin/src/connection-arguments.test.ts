import { UltimaBase } from '@ultimabase/core'
import { anonymous } from '@ultimabase/core/plugin'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { graphqlPlugin } from './plugin.js'
import { graphqlFixtureDatabasePlugin } from './test-application.test-support.js'

const Shelf = UltimaBase.Schema.define({
	className: 'ConnectionArgumentShelf',
	fields: (field) => ({
		label: field.string(),
		books: field.relation({ target: 'ConnectionArgumentBook' }),
	}),
})
const Book = UltimaBase.Schema.define({
	className: 'ConnectionArgumentBook',
	fields: (field) => ({ title: field.string() }),
})

const start = async () => {
	const error = vi.fn()
	const application = new (UltimaBase.use(
		graphqlFixtureDatabasePlugin,
		graphqlPlugin({
			pagination: { defaultTake: 2, maxTake: 3 },
			publicWrites: true,
		}),
	))({
		logger: { debug: vi.fn(), error, info: vi.fn(), warn: vi.fn() },
		schemas: [Shelf, Book],
	})
	onTestFinished(() => application.dispose())
	await application.start()
	const graphql = application.plugin('@ultimabase/graphql-plugin')
	const execute = (
		document: string,
		variables?: Readonly<Record<string, unknown>>,
	) =>
		graphql.execute({
			context: anonymous(application, {
				requestId: 'connection-arguments',
				source: 'test',
			}).context,
			document,
			...(variables === undefined ? {} : { variables }),
		})
	return { error, execute }
}

const invalidFirst = {
	message: 'The first argument must be an integer from 0 to 3.',
	extensions: {
		code: 'VALIDATION_ERROR',
		details: { parameter: 'first' },
		requestId: 'connection-arguments',
		retryable: false,
	},
}

const repeatedOrder = (field: string) => ({
	message: `The orderBy argument repeats the field ${field}.`,
	extensions: {
		code: 'VALIDATION_ERROR',
		details: { parameter: 'orderBy' },
		requestId: 'connection-arguments',
		retryable: false,
	},
})

// Connection arguments are client input: a bad one is the client's
// VALIDATION_ERROR, never a masked and logged server failure.
describe('GraphQL connection argument validation', () => {
	it.each([
		'{ findManyConnectionArgumentShelf(first: 4) { nodes { id } } }',
		'{ findManyConnectionArgumentShelf(first: -1) { nodes { id } } }',
		'{ findManyConnectionArgumentShelf(first: 2147483647) { nodes { id } } }',
		'{ findManyConnectionArgumentShelf { nodes { books(first: 4) { nodes { id } } } } }',
		'{ findManyConnectionArgumentShelf { nodes { books(first: -1) { nodes { id } } } } }',
	])('rejects an out-of-range first: %s', async (document) => {
		const { error, execute } = await start()
		const result = await execute(document)

		expect(result.data).toBeNull()
		expect(result.errors?.map((item) => item.toJSON())).toStrictEqual([
			{
				...invalidFirst,
				locations: [{ line: 1, column: 3 }],
				path: ['findManyConnectionArgumentShelf'],
			},
		])
		expect(error).not.toHaveBeenCalled()
	})

	it('rejects an out-of-range first passed as a variable', async () => {
		const { error, execute } = await start()
		const result = await execute(
			'query Shelves($first: Int) { findManyConnectionArgumentShelf(first: $first) { nodes { id } } }',
			{ first: 100 },
		)

		expect(result.errors?.map((item) => item.toJSON())).toMatchObject([
			invalidFirst,
		])
		expect(error).not.toHaveBeenCalled()
	})

	it('rejects an out-of-range first selected by a mutation', async () => {
		const { error, execute } = await start()
		const result = await execute(
			'mutation { createConnectionArgumentShelf(input: { label: "a" }) { books(first: 4) { nodes { id } } } }',
		)

		expect(result.errors?.map((item) => item.toJSON())).toMatchObject([
			invalidFirst,
		])
		expect(error).not.toHaveBeenCalled()
	})

	it.each([
		[
			'{ findManyConnectionArgumentShelf(orderBy: [{ field: label, direction: ASC }, { field: label, direction: DESC }]) { nodes { id } } }',
			'label',
		],
		[
			'{ findOneConnectionArgumentShelf(orderBy: [{ field: id, direction: ASC }, { field: id, direction: ASC }]) { id } }',
			'id',
		],
		[
			'{ findManyConnectionArgumentShelf { nodes { books(orderBy: [{ field: title, direction: ASC }, { field: title, direction: DESC }]) { nodes { id } } } } }',
			'title',
		],
	])('rejects a repeated orderBy field: %s', async (document, field) => {
		const { error, execute } = await start()
		const result = await execute(document)

		expect(result.errors?.map((item) => item.toJSON())).toMatchObject([
			repeatedOrder(field),
		])
		expect(error).not.toHaveBeenCalled()
	})
})
