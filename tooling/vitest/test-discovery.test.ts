import { execFile } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { isolatedE2eSuites } from './isolated-e2e.ts'
import { packageCoverageThresholds } from './package-coverage.ts'

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
		const manifest = readFileSync(
			path.join(repositoryRoot, 'package.json'),
			'utf8',
		)
		const builtCommand = /"test:e2e:built": "([^"]*)"/u.exec(manifest)?.[1]
		for (const file of e2eFiles) {
			const builtProject = file.endsWith('.postgres.e2e.test.ts')
				? 'postgres-e2e'
				: isolatedE2eSuites.includes(file)
					? 'e2e-isolated'
					: 'e2e'
			expect(builtCommand, file).toContain(`--project ${builtProject} `)
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

	it('measures every source-coverable package E2E and explicit artifact-only exceptions', () => {
		const artifactOnly = new Set([
			'packages/core/tests/e2e/core-archive-declarations.e2e.test.ts',
			'packages/graphql-yoga-plugin/tests/e2e/graphql-yoga-application.e2e.test.ts',
			'packages/auth-password/tests/e2e/auth-password-archive.e2e.test.ts',
			'packages/acl-permissions-plugin/tests/e2e/acl-direct-option.e2e.test.ts',
			'packages/core/tests/e2e/core-field-builder.e2e.test.ts',
			'packages/core/tests/e2e/core-field-option-diagnostics.e2e.test.ts',
			'packages/core/tests/e2e/core-output-builder.e2e.test.ts',
			'packages/core/tests/e2e/core-plugin-manifest.e2e.test.ts',
			'packages/core/tests/e2e/core-public-query-types.e2e.test.ts',
			'packages/core/tests/e2e/core-runtime-capabilities.e2e.test.ts',
			'packages/core/tests/e2e/core-schema-compiler-ir.e2e.test.ts',
			'packages/core/tests/e2e/core-schema-targets.e2e.test.ts',
			'packages/core/tests/e2e/plugin-operations.e2e.test.ts',
			'packages/create-app/tests/e2e/create-app-packed.e2e.test.ts',
			'packages/graphql-plugin/tests/e2e/graphql-schema-execution.e2e.test.ts',
			'packages/http-plugin/tests/e2e/http-application.e2e.test.ts',
			'packages/pg-vector-plugin/tests/e2e/pg-vector-field-builder.e2e.test.ts',
			'packages/plugin-kit/tests/e2e/plugin-kit-authoring-language-service.e2e.test.ts',
			'packages/rest-plugin/tests/e2e/rest-application.e2e.test.ts',
			'packages/soft-delete-plugin/tests/e2e/soft-delete-plugin.e2e.test.ts',
			'packages/validation-plugin/tests/e2e/standard-schema-validation.e2e.test.ts',
		])
		for (const file of e2eFiles) {
			const coverage = rootFiles.filter(
				(entry) =>
					entry.file === file && entry.projectName.startsWith('coverage-'),
			)
			// Transversal suites never count toward a package's coverage.
			expect(coverage, file).toHaveLength(
				file.startsWith('packages/') && !artifactOnly.has(file) ? 1 : 0,
			)
		}
		for (const file of artifactOnly) expect(e2eFiles).toContain(file)
	})

	it('gives every package its own coverage thresholds', () => {
		expect(Object.keys(packageCoverageThresholds).sort()).toEqual(
			packageManifests
				.map((manifest) => path.basename(path.dirname(manifest)))
				.sort(),
		)
	})

	it('builds every package declaration before repository-wide test typechecking', () => {
		// A missing reference can stay invisible behind an earlier package build.
		const config = ts.getParsedCommandLineOfConfigFile(
			path.join(repositoryRoot, 'tsconfig.json'),
			{},
			{
				...ts.sys,
				onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
					throw new Error(
						ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
					)
				},
			},
		)
		expect(config?.errors).toEqual([])
		expect(
			config?.projectReferences?.map((reference) => reference.path).sort(),
		).toEqual(
			packageManifests
				.map((manifest) => path.dirname(path.join(repositoryRoot, manifest)))
				.sort(),
		)
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
				path.join(repositoryRoot, 'tests/fixtures/register.d.ts'),
			)
		}
	})

	it.each(
		packageManifests.map((manifest) => path.basename(path.dirname(manifest))),
	)(
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
				// A package runs its few E2E files together: only the root
				// configuration isolates suites from the full parallel run.
				const root = rootFiles
					.filter(
						(entry) =>
							(entry.projectName === projectName ||
								(projectName === 'e2e' &&
									entry.projectName === 'e2e-isolated')) &&
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
