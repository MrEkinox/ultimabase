import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ultimabaseTesting } from '../src/vitest.js'

// Vite resolves a test file's imports without Node.js's `module-sync`
// condition, then loads the file natively; a dependency loaded natively
// resolves with it. A package shipping both an ESM and a CommonJS build, such
// as `graphql`, then had two instances in one worker ("Cannot use
// GraphQLSchema from another module or realm"). A nested Vitest checks that
// `ultimabaseTesting()` keeps one instance.
const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
let project = ''

const files: Readonly<Record<string, string>> = {
	'node_modules/dual-build/package.json': JSON.stringify({
		name: 'dual-build',
		exports: {
			'.': { 'module-sync': './index.mjs', node: './index.cjs' },
		},
	}),
	'node_modules/dual-build/index.mjs': 'export const marker = {}\n',
	'node_modules/dual-build/index.cjs': 'exports.marker = {}\n',
	// A dependency that imports the dual package natively.
	'node_modules/native-consumer/package.json': JSON.stringify({
		name: 'native-consumer',
		type: 'module',
		exports: './index.js',
	}),
	'node_modules/native-consumer/index.js':
		"export { marker } from 'dual-build'\n",
	'realm.check.js': [
		"import { marker as fromTest } from 'dual-build'",
		"import { marker as fromDependency } from 'native-consumer'",
		'',
		"it('loads one instance', () => {",
		'\texpect(fromTest).toBe(fromDependency)',
		'})',
		'',
	].join('\n'),
}

beforeAll(async () => {
	project = await mkdtemp(path.join(tmpdir(), 'ultimabase-realm-'))
	for (const [name, content] of Object.entries(files)) {
		const file = path.join(project, name)
		await mkdir(path.dirname(file), { recursive: true })
		await writeFile(file, content)
	}
})

afterAll(async () => {
	await rm(project, { force: true, recursive: true })
})

const runProject = async (execArgv: readonly string[]) => {
	const config = path.join(project, 'vitest.config.mjs')
	await writeFile(
		config,
		`export default ${JSON.stringify({
			test: { execArgv, globals: true, include: ['*.check.js'] },
		})}\n`,
	)
	return execFileAsync(
		path.join(repositoryRoot, 'node_modules/.bin/vitest'),
		['run', '--root', project, '--config', config],
		{ cwd: project, env: process.env },
	)
}

describe('ultimabaseTesting() module resolution', () => {
	it('loads a dual ESM and CommonJS package once', async () => {
		const { stdout } = await runProject(ultimabaseTesting().execArgv)
		expect(stdout).toContain('1 passed')
	}, 60_000)

	it('detects two instances without it', async () => {
		const failure: unknown = await runProject([]).catch(
			(error: unknown) => error,
		)
		expect(failure).toHaveProperty('stdout')
		expect(Reflect.get(Object(failure), 'stdout')).toContain('1 failed')
	}, 60_000)
})
