// A validation issue over REST (D-88): the code of a `PublicError` that a
// field's `validate` throws reaches the client in `details.issues`.
import { defineModel, PublicError } from 'ultimabase'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { rest } from './index.ts'
import { asMaster, call, started } from './test/app.ts'

const Account = defineModel({
	name: 'Account',
	use: [rest()],
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
	running = await started({}, undefined, [], [Account])
})
afterAll(async () => running?.app.stop())

it("sends a validate function's PublicError code in its issue", async () => {
	const sent = await call(running?.url ?? '', 'POST', '/api/accounts', {
		body: { handle: 'admin' },
		headers: asMaster,
	})
	expect(sent).toStrictEqual({
		status: 400,
		body: {
			code: 'VALIDATION_FAILED',
			message: 'Invalid data.',
			details: {
				issues: [
					{
						path: ['handle'],
						code: 'HANDLE_RESERVED',
						message: 'This handle is reserved.',
					},
				],
			},
		},
	})
})
