import { execFile } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const execute = promisify(execFile)
interface DiscoveredFile {
	readonly file: string
	readonly projectName: string
}

// Ask Vitest itself: matching a copied glob would miss config inheritance regressions.
const discover = async (
	directory: string,
): Promise<readonly DiscoveredFile[]> => {
	const { stdout } = await execute(
		process.execPath,
		[
			path.join(repositoryRoot, 'node_modules/vitest/vitest.mjs'),
			'list',
			'--filesOnly',
			'--json',
		],
		{ cwd: directory, maxBuffer: 2 * 1024 * 1024 },
	)
	const result: unknown = JSON.parse(stdout)
	if (!Array.isArray(result))
		throw new TypeError('Expected a Vitest file inventory')
	return result.map((value: unknown) => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('file' in value) ||
			typeof value.file !== 'string' ||
			!('projectName' in value) ||
			typeof value.projectName !== 'string'
		) {
			throw new TypeError('Invalid Vitest file inventory entry')
		}
		return {
			file: path.relative(repositoryRoot, value.file),
			projectName: value.projectName,
		}
	})
}

const rootFiles = await discover(repositoryRoot)
const packageManifests = globSync('packages/*/package.json', {
	cwd: repositoryRoot,
})
const e2eFiles = globSync(
	['packages/*/tests/e2e/**/*.e2e.test.ts', 'tests/e2e/**/*.e2e.test.ts'],
	{ cwd: repositoryRoot },
)

describe('test ownership and discovery', () => {
	it('runs every E2E exactly once through its built-export project, never as a unit', () => {
		for (const file of e2eFiles) {
			const builtProject = file.endsWith('.postgres.e2e.test.ts')
				? 'postgres-e2e'
				: 'e2e'
			expect(
				rootFiles.filter(
					(entry) => entry.file === file && entry.projectName === builtProject,
				),
				file,
			).toHaveLength(1)
			expect(
				rootFiles.filter(
					(entry) => entry.file === file && entry.projectName === 'unit',
				),
				file,
			).toHaveLength(0)
		}
	})

	it('runs every performance suite exactly once, never as a unit or E2E', () => {
		const files = globSync(
			[
				'tests/performance/**/*.performance.test.ts',
				'packages/*/tests/performance/**/*.performance.test.ts',
			],
			{ cwd: repositoryRoot },
		)
		for (const file of files) {
			expect(
				rootFiles.filter((entry) => entry.file === file),
				file,
			).toEqual([{ file, projectName: 'performance' }])
		}
	})

	it('retains every source-coverable E2E and explicit artifact-only exceptions', () => {
		const artifactOnly = new Set([
			'tests/e2e/package-archives.e2e.test.ts',
			'packages/core/tests/e2e/core-archive-declarations.e2e.test.ts',
			'packages/graphql-yoga-plugin/tests/e2e/graphql-yoga-application.e2e.test.ts',
			'packages/password-auth-plugin/tests/e2e/password-auth-plugin.e2e.test.ts',
		])
		for (const file of e2eFiles) {
			const coverage = rootFiles.filter(
				(entry) =>
					entry.file === file && entry.projectName.startsWith('coverage-'),
			)
			expect(coverage, file).toHaveLength(artifactOnly.has(file) ? 0 : 1)
		}
		for (const file of artifactOnly) expect(e2eFiles).toContain(file)
	})

	it('keeps package compiler roots local, including declaration support but no foreign suites', () => {
		for (const manifest of packageManifests) {
			const directory = path.dirname(path.join(repositoryRoot, manifest))
			const configFile = path.join(directory, 'tsconfig.test.json')
			const read = ts.readConfigFile(configFile, (file) =>
				readFileSync(file, 'utf8'),
			)
			expect(read.error, configFile).toBeUndefined()
			const config = ts.parseJsonConfigFileContent(
				read.config,
				ts.sys,
				directory,
			)
			expect(config.errors, configFile).toEqual([])
			const foreignSuites = config.fileNames.filter(
				(file) =>
					/\.test(?:-d)?\.ts$/u.test(file) &&
					!file.startsWith(`${directory}${path.sep}`),
			)
			expect(foreignSuites, manifest).toEqual([])
			expect(config.fileNames).toContain(
				path.join(repositoryRoot, 'tests/fixtures/plugin-options.d.ts'),
			)
		}
	})

	it.each(['rest-plugin', 'typegen'])(
		'selects the same %s tests from the package command as from the root',
		async (packageName) => {
			const prefix = `packages/${packageName}/`
			const local = await discover(path.join(repositoryRoot, prefix))
			for (const projectName of [
				'unit',
				'types',
				'e2e',
				'postgres-e2e',
				'performance',
			]) {
				const root = rootFiles
					.filter(
						(entry) =>
							entry.projectName === projectName &&
							entry.file.startsWith(prefix),
					)
					.map(({ file }) => file)
					.sort()
				expect(
					local
						.filter((entry) => entry.projectName === projectName)
						.map(({ file }) => file)
						.sort(),
				).toEqual(root)
			}
		},
	)
})
