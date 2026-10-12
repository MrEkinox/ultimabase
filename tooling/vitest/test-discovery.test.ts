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

// Resolve the real Yarn command and Vitest projects without executing their suites.
const coverageWorkers = async (
	workers: string | undefined,
): Promise<unknown> => {
	const manifest: unknown = JSON.parse(
		readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
	)
	if (
		typeof manifest !== 'object' ||
		manifest === null ||
		!('scripts' in manifest) ||
		typeof manifest.scripts !== 'object' ||
		manifest.scripts === null ||
		!('test:coverage' in manifest.scripts) ||
		typeof manifest.scripts['test:coverage'] !== 'string' ||
		!manifest.scripts['test:coverage'].startsWith('vitest run ')
	) {
		throw new TypeError('Expected the canonical Vitest coverage command')
	}
	const probe = `
		import { createVitest, parseCLI } from 'vitest/node';
		const { options } = parseCLI(['vitest', 'run', ...process.argv.slice(1)]);
		const context = await createVitest('test', {
			...options, api: false, watch: false, coverage: { enabled: false }
		});
		try {
			console.log(JSON.stringify({
				maxWorkers: context.config.maxWorkers,
				projects: context.projects.map(project => ({
					name: project.name,
					maxWorkers: project.config.maxWorkers ?? context.config.maxWorkers,
					fileParallelism: project.config.fileParallelism
				}))
			}));
		} finally { await context.close(); }
	`
	const environment = { ...process.env }
	delete environment.VITEST_MAX_WORKERS
	delete environment.ULTIMABASE_COVERAGE_WORKERS
	if (workers !== undefined) environment.ULTIMABASE_COVERAGE_WORKERS = workers
	const { stdout } = await execute(
		'yarn',
		[
			'exec',
			`${JSON.stringify(process.execPath)} --input-type=module -e ${JSON.stringify(probe.replace(/\s+/gu, ' ').trim())} -- ${manifest.scripts['test:coverage'].slice('vitest run '.length)}`,
		],
		{ cwd: repositoryRoot, env: environment, maxBuffer: 2 * 1024 * 1024 },
	)
	const result: unknown = JSON.parse(stdout)
	return result
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
	it.each([
		{ environment: 'local', workers: undefined, expected: 4 },
		{ environment: 'hosted CI', workers: '2', expected: 2 },
	])(
		'resolves $environment coverage workers without parallelizing performance',
		async ({ workers, expected }) => {
			expect(await coverageWorkers(workers)).toEqual({
				maxWorkers: expected,
				projects: [
					{ name: 'unit', maxWorkers: expected, fileParallelism: true },
					{ name: 'coverage-e2e', maxWorkers: expected, fileParallelism: true },
					{
						name: 'coverage-postgres-e2e',
						maxWorkers: expected,
						fileParallelism: true,
					},
					{ name: 'performance', maxWorkers: 1, fileParallelism: false },
					{ name: 'types', maxWorkers: expected, fileParallelism: true },
				],
			})
			const workflow = readFileSync(
				path.join(repositoryRoot, '.github/workflows/ci.yml'),
				'utf8',
			)
			const coverageJob = workflow.slice(
				workflow.indexOf('\n  coverage:'),
				workflow.indexOf('\n  website:'),
			)

			// Vitest's native environment override defeats its serial-project limit.
			expect(coverageJob).toContain('ULTIMABASE_COVERAGE_WORKERS: 2')
			expect(coverageJob).not.toContain('VITEST_MAX_WORKERS:')
		},
	)

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
			'tests/e2e/optional-product-public-api.e2e.test.ts',
			'tests/e2e/register-required.e2e.test.ts',
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
				path.join(repositoryRoot, 'tests/fixtures/plugin-options.d.ts'),
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
