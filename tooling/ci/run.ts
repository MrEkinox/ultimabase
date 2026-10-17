import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { builtOnlyE2eSuites } from '../vitest/built-only-e2e.ts'
import { isolatedE2eSuites } from '../vitest/isolated-e2e.ts'
import type { CiPlan } from './selection.ts'

const record = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
const strings = (value: unknown): value is string[] =>
	Array.isArray(value) &&
	value.every((entry: unknown) => typeof entry === 'string')
const validPlan = (value: unknown): value is CiPlan =>
	record(value) &&
	['full', 'build', 'tooling', 'documentation', 'website'].every(
		(key) => typeof value[key] === 'boolean',
	) &&
	['changed', 'transversal', 'workspaceLint'].every((key) =>
		strings(value[key]),
	) &&
	Array.isArray(value.packages) &&
	value.packages.every(
		(item: unknown) =>
			record(item) &&
			typeof item.name === 'string' &&
			/^@ultimabase\/[a-z0-9-]+$/u.test(item.name) &&
			typeof item.directory === 'string' &&
			/^packages\/[a-z0-9-]+$/u.test(item.directory) &&
			typeof item.browser === 'boolean' &&
			typeof item.coverage === 'boolean' &&
			strings(item.files),
	)
const input: unknown = JSON.parse(process.env.CI_PLAN ?? 'null')
if (!validPlan(input)) throw new TypeError('Missing or malformed CI_PLAN')
const plan = input
const repositoryRoot = process.cwd()
const run = (args: readonly string[], cwd = repositoryRoot): void => {
	console.info(`yarn ${args.join(' ')}`)
	const result = spawnSync('yarn', [...args], {
		cwd,
		stdio: 'inherit',
		env: process.env,
	})
	if (result.error !== undefined) throw result.error
	if (result.status !== 0)
		throw new Error(
			`Command failed (${String(result.status)}): ${args.join(' ')}`,
		)
}
// Instrumented projects: unit tests and package-owned E2E run from sources.
const coverageProjects = new Set([
	'unit',
	'coverage-e2e',
	'coverage-postgres-e2e',
])
const projectOf = (file: string, coverage: boolean): string =>
	file.endsWith('.postgres.e2e.test.ts')
		? coverage
			? 'coverage-postgres-e2e'
			: 'postgres-e2e'
		: isolatedE2eSuites.includes(file)
			? 'e2e-isolated'
			: file.endsWith('.e2e.test.ts')
				? coverage && !builtOnlyE2eSuites.includes(file)
					? 'coverage-e2e'
					: 'e2e'
				: file.endsWith('.performance.test.ts')
					? 'performance'
					: 'unit'
const vitest = (
	files: readonly string[],
	coverage: boolean,
	extra: readonly string[] = [],
): void => {
	if (files.length === 0) return
	// Filters alone are insufficient: select projects explicitly to avoid duplicates.
	const projects = new Set(files.map((file) => projectOf(file, coverage)))
	run(
		[
			'exec',
			'vitest',
			'run',
			...[...projects].flatMap((project) => ['--project', project]),
			'--maxWorkers=2',
			...extra,
			...files.map((file) => path.join(repositoryRoot, file)),
		],
		// Existing subprocess and generated-application fixtures resolve from the repository root.
		repositoryRoot,
	)
}
/**
 * Runs each suite once. With a package `directory`, unit tests and the
 * package's source-coverable E2E run instrumented and must meet that package's
 * thresholds; performance budgets and built-only E2E run uninstrumented.
 */
const tests = (
	files: readonly string[],
	cwd = repositoryRoot,
	directory?: string,
): void => {
	const typeFiles = files.filter((file) => file.endsWith('.test-d.ts'))
	if (typeFiles.length > 0)
		run(
			[
				'exec',
				'vitest',
				'run',
				'--project',
				'types',
				...typeFiles.map((file) => path.join(repositoryRoot, file)),
			],
			cwd,
		)
	const runtimeFiles = files.filter((file) => !file.endsWith('.test-d.ts'))
	if (directory === undefined) {
		vitest(runtimeFiles, false)
		return
	}
	const instrumented = runtimeFiles.filter((file) =>
		coverageProjects.has(projectOf(file, true)),
	)
	vitest(instrumented, true, [
		'--coverage.enabled',
		`--coverage.include=${directory}/src/**/*.ts`,
	])
	vitest(
		runtimeFiles.filter((file) => !instrumented.includes(file)),
		true,
	)
}

switch (process.argv[2]) {
	case 'repository': {
		const formatted = plan.changed.filter((file) => existsSync(file))
		if (plan.full) run(['format:check'])
		else if (formatted.length > 0)
			run(['prettier', '--check', '--ignore-unknown', '--', ...formatted])
		if (plan.documentation) {
			// The complete tooling selection below already includes the documentation guards.
			if (!plan.tooling)
				run(['vitest', 'run', '--project', 'unit', 'tooling/documentation/'])
			// Landing examples and Twoslash snippets compile against built exports.
			run(
				plan.build
					? ['website:validate']
					: [
							'website:validate',
							'--exclude',
							'**/landing-samples.content.test.ts',
							'--exclude',
							'**/landing-stacks.content.test.ts',
							'--exclude',
							'**/compiled-snippets.content.test.ts',
						],
			)
		}
		if (plan.tooling)
			run(['vitest', 'run', '--project', 'unit', 'tooling/', '--maxWorkers=2'])
		break
	}
	case 'package': {
		const selected = plan.packages.find(
			({ name }) => name === process.env.CI_PACKAGE,
		)
		if (selected === undefined)
			throw new Error('Package was not selected by the planner')
		run(['workspace', selected.name, 'typecheck:tests'])
		run(['eslint', selected.directory])
		// A package selected only as a consumer of another change runs part of
		// its suites: its coverage is measured when all of them are selected.
		tests(
			selected.files,
			path.join(repositoryRoot, selected.directory),
			selected.coverage ? selected.directory : undefined,
		)
		break
	}
	case 'transversal': {
		if (!plan.full && plan.workspaceLint.length > 0)
			run(['eslint', ...plan.workspaceLint])
		if (plan.full) {
			run(['tsc', '--project', 'tooling/tsconfig/test.json'])
			run(['lint:workspace'])
		} else if (plan.transversal.length > 0)
			run(['tsc', '--project', 'tests/tsconfig.json'])
		tests(plan.transversal)
		break
	}
	default:
		throw new Error('Expected repository, package, or transversal command')
}
