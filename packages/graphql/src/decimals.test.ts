// Decimal fields over GraphQL (D-145): the `Decimal` scalar, a string in and
// out, filtered by value; the kernel checks the field's digits.
import { httpPlugin } from '@ultimabase/http'
import type { GraphQLSchema } from 'graphql'
import { parseConstValue, printType } from 'graphql'
import type { Logger } from 'ultimabase'
import { allow, defineApp, defineModel, memory } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { graphql, graphqlPlugin } from './index.ts'
import { DecimalScalar } from './scalars.ts'
import { asMaster, post } from './test/app.ts'

const Price = defineModel({
	name: 'Price',
	use: [graphql()],
	fields: (f) => ({
		amount: f.decimal({ precision: 6, scale: 2 }),
		tax: f.decimal({ precision: 3, scale: 1, optional: true }),
	}),
}).with({ access: allow.public })

let schema: GraphQLSchema | undefined
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
	plugins: [
		httpPlugin({ port: 0 }),
		graphqlPlugin({
			extend: (generated) => {
				schema = generated
				return generated
			},
		}),
	],
	models: [Price],
	masterKey: 'secret',
	logger,
})
let url = ''
beforeAll(async () => {
	await app.start()
	const line = lines.find(
		(first) => typeof first === 'string' && first.startsWith('Listening on'),
	)
	url = `${String(line).replace(/^Listening on (.*)\.$/, '$1')}/graphql`
})
afterAll(async () => app.stop())

const typeOf = (name: string): string => {
	const type = schema?.getType(name)
	return type === undefined ? 'none' : printType(type)
}
const send = (query: string, variables?: object) =>
	post(url, query, variables, asMaster)

describe('the Decimal scalar', () => {
	it('reads and writes a string, and nothing else', () => {
		expect(DecimalScalar.coerceInputValue('12.5')).toBe('12.5')
		expect(DecimalScalar.coerceOutputValue('12.50')).toBe('12.50')
		expect(DecimalScalar.coerceInputLiteral?.(parseConstValue('"1.5"'))).toBe(
			'1.5',
		)
		const message = "A Decimal is a string, such as '12.50'."
		expect(() => DecimalScalar.coerceInputValue(12.5)).toThrow(message)
		expect(() =>
			DecimalScalar.coerceInputLiteral?.(parseConstValue('12.5')),
		).toThrow(message)
	})
})

describe('a decimal field', () => {
	it('is a Decimal, filtered by value without text operators', () => {
		expect(typeOf('Price')).toContain('  amount: Decimal!\n  tax: Decimal\n')
		expect(typeOf('DecimalFilter')).toBe(
			[
				'input DecimalFilter {',
				'  equals: Decimal',
				'  not: Decimal',
				'  in: [Decimal!]',
				'  notIn: [Decimal!]',
				'  lt: Decimal',
				'  lte: Decimal',
				'  gt: Decimal',
				'  gte: Decimal',
				'}',
			].join('\n'),
		)
	})

	it('is written at its scale and filtered by value', async () => {
		const created = await send(
			'mutation { createPrice(data: { amount: "012.5", tax: "-0" }) { amount tax } }',
		)
		expect(created).toStrictEqual({
			data: { createPrice: { amount: '12.50', tax: '0.0' } },
		})
		await send('mutation { createPrice(data: { amount: "9.99" }) { id } }')
		const found = await send(
			'query ($gt: Decimal) { prices(where: { amount: { gt: $gt } }) { edges { node { amount } } } }',
			{ gt: '10' },
		)
		expect(found).toStrictEqual({
			data: { prices: { edges: [{ node: { amount: '12.50' } }] } },
		})
	})

	it("refuses what the field cannot hold with the kernel's message", async () => {
		const result = await send(
			'mutation { createPrice(data: { amount: "12.345" }) { id } }',
		)
		expect(result.errors?.[0]?.extensions).toMatchObject({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{
						path: ['amount'],
						message:
							"Expected a decimal string of at most 6 digits, 2 after the point, such as '12.50'.",
					},
				],
			},
		})
	})
})
