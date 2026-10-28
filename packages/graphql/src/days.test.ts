// Calendar days over GraphQL (D-150): the `Date` scalar, a string in and out,
// filtered in the calendar's order; the kernel checks the day.
import { httpPlugin } from '@ultimabase/http'
import type { GraphQLSchema } from 'graphql'
import { parseConstValue, printType } from 'graphql'
import type { Logger } from 'ultimabase'
import { allow, defineApp, defineModel, memory } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { graphql, graphqlPlugin } from './index.ts'
import { DateScalar } from './scalars.ts'
import { asMaster, post } from './test/app.ts'

const Shift = defineModel({
	name: 'Shift',
	use: [graphql()],
	fields: (f) => ({
		on: f.date(),
		off: f.date({ optional: true }),
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
	models: [Shift],
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

describe('the Date scalar', () => {
	it('reads and writes a string, and nothing else', () => {
		expect(DateScalar.coerceInputValue('2026-07-31')).toBe('2026-07-31')
		expect(DateScalar.coerceOutputValue('2026-07-31')).toBe('2026-07-31')
		expect(
			DateScalar.coerceInputLiteral?.(parseConstValue('"2026-07-31"')),
		).toBe('2026-07-31')
		const message = "A Date is a day as a string, such as '2026-07-31'."
		expect(() => DateScalar.coerceInputValue(20260731)).toThrow(message)
		expect(() =>
			DateScalar.coerceInputLiteral?.(parseConstValue('20260731')),
		).toThrow(message)
		expect(printType(DateScalar)).toContain('scalar Date')
	})
})

describe('a calendar day field', () => {
	it('is a Date, filtered in order without text operators', () => {
		expect(typeOf('Shift')).toContain('  on: Date!\n  off: Date\n')
		expect(typeOf('DateFilter')).toBe(
			[
				'input DateFilter {',
				'  equals: Date',
				'  not: Date',
				'  in: [Date!]',
				'  notIn: [Date!]',
				'  lt: Date',
				'  lte: Date',
				'  gt: Date',
				'  gte: Date',
				'}',
			].join('\n'),
		)
	})

	it('is written as given and filtered in the calendar order', async () => {
		const created = await send(
			'mutation { createShift(data: { on: "2026-07-31", off: "2026-08-01" }) { on off } }',
		)
		expect(created).toStrictEqual({
			data: { createShift: { on: '2026-07-31', off: '2026-08-01' } },
		})
		await send('mutation { createShift(data: { on: "0999-12-31" }) { id } }')
		const found = await send(
			'query ($gt: Date) { shifts(where: { on: { gt: $gt } }) { edges { node { on } } } }',
			{ gt: '1000-01-01' },
		)
		expect(found).toStrictEqual({
			data: { shifts: { edges: [{ node: { on: '2026-07-31' } }] } },
		})
	})

	it("refuses a day that does not exist with the kernel's message", async () => {
		const result = await send(
			'mutation { createShift(data: { on: "2026-02-29" }) { id } }',
		)
		expect(result.errors?.[0]?.extensions).toMatchObject({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{ path: ['on'], message: "Expected a day written '2026-07-31'." },
				],
			},
		})
	})
})
