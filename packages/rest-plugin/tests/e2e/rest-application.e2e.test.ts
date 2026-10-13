import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect, it } from 'vitest'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/rest-application-javascript.mjs',
)
const nestedFixturePath = path.join(
	import.meta.dirname,
	'fixtures/rest-nested-normalization-javascript.mjs',
)

it('runs packed REST v1 from JavaScript', async () => {
	const { stdout } = await executeFile(process.execPath, [fixturePath])
	const output: unknown = JSON.parse(stdout)

	expect(output).toStrictEqual({
		body: {
			nextCursor: null,
			results: [
				{
					createdAt: '2026-09-05T12:00:00.000Z',
					id: '01991f00-0000-7000-8000-000000000301',
					summary: {
						bytes: { data: 'AQID', encoding: 'base64', type: 'binary' },
						label: 'TYPEGEN-FREE',
						total: '9007199254740993',
					},
					title: 'Typegen-free',
					updatedAt: '2026-09-05T12:00:00.000Z',
				},
			],
		},
		cache: 'private, no-store',
		requestId: 'javascript-rest-request',
		status: 200,
	})
})

it('decodes packed nested writes from JavaScript', async () => {
	const { stdout } = await executeFile(process.execPath, [nestedFixturePath])
	const output: unknown = JSON.parse(stdout)

	expect(output).toStrictEqual({
		connect: ['01991f00-0000-7000-8000-000000000401'],
		kind: 'create-one',
		legacyCode: 'REST_MUTATION_INVALID_INPUT',
		score: '7',
		validLegacyRejection: true,
	})
})
