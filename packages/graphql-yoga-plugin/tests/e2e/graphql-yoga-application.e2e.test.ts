import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/graphql-yoga-managed.mjs',
)

it('serves the packed GraphQL Yoga adapter through managed Hono', async () => {
	const { stdout } = await executeFile(process.execPath, [fixturePath])
	const output: unknown = JSON.parse(stdout)

	expect(output).toStrictEqual({
		body: {
			data: {
				findOneManagedVirtual: { summary: 'PACKED YOGA' },
				value: 'network-value',
			},
		},
		closed: true,
		mutation: {
			data: {
				archiveOneManagedVirtual: {
					createdAt: '2026-09-10T00:00:00.000Z',
					id: '01991f00-0000-7000-8000-000000000704',
					title: 'Packed Yoga',
					updatedAt: '2026-09-10T00:00:00.000Z',
					workflowArchived: true,
				},
			},
		},
		status: 200,
	})
})
