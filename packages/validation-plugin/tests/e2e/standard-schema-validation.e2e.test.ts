import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect, it } from 'vitest'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/standard-schema-validation-javascript.mjs',
)

it('executes real Standard Schema validators from JavaScript', async () => {
	const { stdout } = await executeFile(process.execPath, [fixturePath])
	const output: unknown = JSON.parse(stdout)

	expect(output).toStrictEqual(
		['Zod', 'Valibot'].map((name) => ({
			code: 'field.validation',
			message: 'JavaScript validator rejected the title',
			name,
			path: ['input', 'title'],
		})),
	)
})
