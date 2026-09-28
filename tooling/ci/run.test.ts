import { spawnSync } from 'node:child_process'
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CiPlan } from './selection.ts'

const directories: string[] = []
afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true })
})
const selected: CiPlan = {
	full: false,
	changed: [],
	packages: [
		{
			name: '@ultimabase/example',
			directory: 'packages/example',
			browser: false,
			files: [
				'packages/example/src/example.test.ts',
				'packages/example/src/example.test-d.ts',
				'packages/example/tests/example.e2e.test.ts',
			],
		},
	],
	transversal: [],
	build: true,
	coverage: false,
	tooling: false,
	documentation: false,
	issues: false,
	website: false,
	workspaceLint: [],
}
const execute = (
	mode: string,
	plan: unknown,
	fail = false,
	packageName = '@ultimabase/example',
) => {
	const directory = realpathSync(
		mkdtempSync(path.join(tmpdir(), 'ultimabase-ci-run-')),
	)
	directories.push(directory)
	mkdirSync(path.join(directory, 'packages/example'), { recursive: true })
	writeFileSync(path.join(directory, 'README.md'), '# Documentation')
	const log = path.join(directory, 'commands.jsonl')
	writeFileSync(log, '')
	// Exercise the actual native CLI while recording, rather than executing, Yarn subprocesses.
	writeFileSync(
		path.join(directory, 'yarn'),
		`#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + '\\n');
process.exit(process.env.FAIL_COMMAND === 'true' ? 7 : 0);
`,
		{ mode: 0o755 },
	)
	const result = spawnSync(
		process.execPath,
		[path.join(import.meta.dirname, 'run.ts'), mode],
		{
			cwd: directory,
			encoding: 'utf8',
			env: {
				...process.env,
				PATH: `${directory}${path.delimiter}${process.env.PATH ?? ''}`,
				CI_PLAN: JSON.stringify(plan),
				CI_PACKAGE: packageName,
				COMMAND_LOG: log,
				FAIL_COMMAND: String(fail),
			},
		},
	)
	const commands: unknown[] = readFileSync(log, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line): unknown => JSON.parse(line))
	return { result, commands, directory }
}

describe('GitHub selected command execution', () => {
	it('uses the canonical repository-wide format gate during full validation', () => {
		const { result, commands, directory } = execute('repository', {
			...selected,
			full: true,
			changed: [],
		})
		expect(result.status, result.stderr).toBe(0)
		expect(commands).toEqual([
			{
				cwd: directory,
				args: ['format:check'],
			},
		])
	})
	it('keeps compiled landing examples when package artifacts are available', () => {
		const { result, commands, directory } = execute('repository', {
			...selected,
			documentation: true,
		})
		expect(result.status, result.stderr).toBe(0)
		expect(commands).toContainEqual({
			cwd: directory,
			args: ['website:validate'],
		})
	})
	it('checks only selected suites and keeps runtime fixtures rooted at the repository', () => {
		const { result, commands, directory } = execute('package', selected)
		expect(result.status, result.stderr).toBe(0)
		expect(commands).toEqual([
			{
				cwd: directory,
				args: ['workspace', '@ultimabase/example', 'typecheck:tests'],
			},
			{ cwd: directory, args: ['eslint', 'packages/example'] },
			{
				cwd: path.join(directory, 'packages/example'),
				args: [
					'exec',
					'vitest',
					'run',
					'--project',
					'types',
					path.join(directory, 'packages/example/src/example.test-d.ts'),
				],
			},
			{
				cwd: directory,
				args: [
					'exec',
					'vitest',
					'run',
					'--project',
					'unit',
					'--project',
					'e2e',
					'--maxWorkers=2',
					path.join(directory, 'packages/example/src/example.test.ts'),
					path.join(directory, 'packages/example/tests/example.e2e.test.ts'),
				],
			},
		])
	})
	it('does not duplicate units and types already executed by complete coverage', () => {
		const { result, commands, directory } = execute('package', {
			...selected,
			full: true,
			coverage: true,
		})
		expect(result.status, result.stderr).toBe(0)
		expect(commands).toHaveLength(3)
		expect(commands[2]).toEqual({
			cwd: directory,
			args: [
				'exec',
				'vitest',
				'run',
				'--project',
				'e2e',
				'--maxWorkers=2',
				path.join(directory, 'packages/example/tests/example.e2e.test.ts'),
			],
		})
	})
	it('limits documentation changes to formatting and documentation guards', () => {
		const { result, commands, directory } = execute('repository', {
			...selected,
			changed: ['README.md'],
			documentation: true,
			packages: [],
			build: false,
		})
		expect(result.status, result.stderr).toBe(0)
		expect(commands).toEqual([
			{
				cwd: directory,
				args: ['prettier', '--check', '--ignore-unknown', '--', 'README.md'],
			},
			{
				cwd: directory,
				args: [
					'vitest',
					'run',
					'--project',
					'unit',
					'tooling/documentation/active-contracts.test.ts',
				],
			},
			{
				cwd: directory,
				args: [
					'website:validate',
					'--exclude',
					'**/landing-samples.content.test.ts',
					'--exclude',
					'**/landing-stacks.content.test.ts',
				],
			},
		])
	})
	it('starts the PostgreSQL project only when a selected suite requires it', () => {
		const file = 'tests/e2e/application.postgres.e2e.test.ts'
		const { result, commands, directory } = execute('transversal', {
			...selected,
			transversal: [file],
		})
		expect(result.status, result.stderr).toBe(0)
		expect(commands).toEqual([
			{ cwd: directory, args: ['tsc', '--project', 'tests/tsconfig.json'] },
			{
				cwd: directory,
				args: [
					'exec',
					'vitest',
					'run',
					'--project',
					'postgres-e2e',
					'--maxWorkers=2',
					path.join(directory, file),
				],
			},
		])
	})
	it('fails immediately when a required command fails', () => {
		const { result, commands } = execute('package', selected, true)
		expect(result.status).not.toBe(0)
		expect(commands).toHaveLength(1)
	})
	it('rejects malformed plans and unselected packages before invoking Yarn', () => {
		for (const run of [
			execute('package', {}),
			execute('package', selected, false, '@ultimabase/other'),
		]) {
			expect(run.result.status).not.toBe(0)
			expect(run.commands).toEqual([])
		}
	})
})
