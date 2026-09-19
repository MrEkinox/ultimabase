import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect, it } from 'vitest'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/graphql-execution-no-typegen.mjs',
)

it('executes packed GraphQL from JavaScript without Typegen', async () => {
	const { stdout } = await executeFile(process.execPath, [fixturePath])
	const output: unknown = JSON.parse(stdout)

	expect(output).toStrictEqual({
		mutation: {
			data: {
				createJavaScriptGraphqlNote: {
					id: '01991f00-0000-7000-8000-000000000613',
				},
			},
		},
		query: {
			data: {
				findManyJavaScriptGraphqlNote: {
					nodes: [
						{
							id: '01991f00-0000-7000-8000-000000000612',
							summary: {
								binary: 'AQID',
								huge: '9007199254740993',
								label: 'TYPEGEN-FREE GRAPHQL',
							},
							title: 'Typegen-free GraphQL',
						},
					],
					pageInfo: { hasNextPage: false },
				},
			},
		},
		writes: [{ score: '7' }],
	})
})
