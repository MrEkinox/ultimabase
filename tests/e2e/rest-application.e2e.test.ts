import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect, it } from 'vitest'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/rest-application-no-typegen.mjs',
)
const generatedTypesCheckPath = path.join(
	import.meta.dirname,
	'../../examples/minimal/src/check-generated-types.ts',
)

it('runs packed REST v1 from JavaScript without Typegen', async () => {
	const { stdout } = await executeFile(process.execPath, [fixturePath])
	const output: unknown = JSON.parse(stdout)

	expect(output).toStrictEqual({
		body: {
			results: [
				{
					createdAt: '2026-09-05T12:00:00.000Z',
					id: '01991f00-0000-7000-8000-000000000301',
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

it('keeps the generated minimal REST declarations aligned', async () => {
	await expect(
		executeFile(process.execPath, [generatedTypesCheckPath]),
	).resolves.toBeDefined()
})
