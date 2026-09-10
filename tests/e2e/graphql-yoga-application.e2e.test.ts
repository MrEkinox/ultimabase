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
		status: 200,
	})
})
