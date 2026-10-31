// A validation issue over GraphQL (D-88): the code of a `PublicError` that a
// field's `validate` throws reaches the client in `details.issues`.
import { defineModel, PublicError } from 'ultimabase'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { graphql } from './index.ts'
import { asMaster, post, started } from './test/app.ts'

const Account = defineModel({
	name: 'Account',
	use: [graphql()],
	fields: (f) => ({
		handle: f.string({
			validate: (value) => {
				if (value === 'admin') {
					throw new PublicError('HANDLE_RESERVED', 'This handle is reserved.')
				}
				return value
			},
		}),
	}),
})

let running: Awaited<ReturnType<typeof started>> | undefined
beforeAll(async () => {
	running = await started({}, undefined, [], [], [Account])
})
afterAll(async () => running?.app.stop())

it("sends a validate function's PublicError code in its issue", async () => {
	const result = await post(
		`${running?.url ?? ''}/graphql`,
		'mutation { createAccount(data: { handle: "admin" }) { id } }',
		undefined,
		asMaster,
	)
	expect(result.errors?.[0]?.extensions).toStrictEqual({
		code: 'VALIDATION_FAILED',
		details: {
			issues: [
				{
					path: ['handle'],
					code: 'HANDLE_RESERVED',
					message: 'This handle is reserved.',
				},
			],
		},
	})
})
