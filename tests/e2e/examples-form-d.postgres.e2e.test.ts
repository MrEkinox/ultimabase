import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { Pool } from 'pg'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inject } from 'vitest'

import { postgresConnectionUriContextKey } from '../fixtures/postgres-context.js'

// ADR-0327 decision 10: the examples use the declaration form only (no
// Typegen, no schema-less `Register`), compile against the built packages,
// and the examples with tests pass them with `testApplication`. ADR-0330: the
// feature examples are the tested source of their plugin's documentation.
const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const examples = [
	'minimal',
	'todo-backend',
	'soft-delete',
	'access',
	'hooks',
	'validation',
] as const
// Quoted repository paths let the CI planner select this suite when they change.
const testedExamples = [
	['examples/todo-backend', 4],
	['examples/soft-delete', 11],
	['examples/access', 19],
	['examples/hooks', 14],
	['examples/validation', 12],
] as const

const compile = (example: string): readonly string[] => {
	const directory = path.join(repositoryRoot, 'examples', example)
	const parsed = ts.getParsedCommandLineOfConfigFile(
		path.join(directory, 'tsconfig.json'),
		{},
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
				throw new TypeError(
					ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
				)
			},
		},
	)
	if (parsed === undefined) throw new TypeError(`Missing ${example} tsconfig`)
	const program = ts.createProgram(parsed.fileNames, parsed.options)
	return ts
		.getPreEmitDiagnostics(program)
		.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		)
}

describe.each(examples)('examples/%s', (example) => {
	const directory = path.join(repositoryRoot, 'examples', example)

	it('compiles without a schema-less Register', () => {
		expect(compile(example)).toStrictEqual([])
		const manifest = readFileSync(path.join(directory, 'package.json'), 'utf8')
		expect(manifest).not.toContain('@ultimabase/typegen')
		expect(existsSync(path.join(directory, '.ultimabase'))).toBe(false)
		const sources = ts.sys
			.readDirectory(path.join(directory, 'src'), ['.ts'])
			.map((file) => readFileSync(file, 'utf8'))
			.join('\n')
		expect(sources).toContain('interface Register')
		expect(sources).not.toContain('UltimaBase<readonly []>')
		expect(sources).not.toMatch(/\.with\(\{\}\)/u)
	}, 60_000)
})

describe.each(testedExamples)('%s tests', (example, testCount) => {
	const containerUrl = inject(postgresConnectionUriContextKey)
	const databaseName = `${path.basename(example).replace('-', '_')}_${String(process.env.VITEST_POOL_ID)}`
	const admin = new Pool({ connectionString: containerUrl, max: 1 })
	const url = new URL(containerUrl)
	url.pathname = `/${databaseName}`

	beforeAll(async () => {
		await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`)
		await admin.query(`CREATE DATABASE "${databaseName}"`)
	})

	afterAll(async () => {
		try {
			await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`)
		} finally {
			await admin.end()
		}
	})

	it('pass with testApplication on their own database', async () => {
		const project = path.join(repositoryRoot, example)
		// The nested run chooses its own worker slots.
		const environment = Object.fromEntries(
			Object.entries(process.env).filter(([name]) => name !== 'VITEST_POOL_ID'),
		)
		const { stdout } = await execFileAsync(
			path.join(repositoryRoot, 'node_modules/.bin/vitest'),
			['run', '--root', project],
			{
				cwd: project,
				env: { ...environment, TEST_DATABASE_URL: url.href },
				maxBuffer: 8 * 1024 * 1024,
			},
		)
		expect(stdout).toContain(`${String(testCount)} passed`)
	}, 120_000)
})
