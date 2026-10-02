import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { CiPlan } from './selection.ts'

const record = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
const strings = (value: unknown): value is string[] =>
	Array.isArray(value) &&
	value.every((entry: unknown) => typeof entry === 'string')
const validPlan = (value: unknown): value is CiPlan =>
	record(value) &&
	[
		'full',
		'build',
		'coverage',
		'tooling',
		'documentation',
		'issues',
		'website',
	].every((key) => typeof value[key] === 'boolean') &&
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
const tests = (files: readonly string[], cwd = repositoryRoot): void => {
	if (files.length === 0) return
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
	if (runtimeFiles.length === 0) return
	// Filters alone are insufficient: select projects explicitly to avoid coverage duplicates.
	const projects = new Set(
		runtimeFiles.map((file) =>
			file.endsWith('.postgres.e2e.test.ts')
				? 'postgres-e2e'
				: file.endsWith('.e2e.test.ts')
					? 'e2e'
					: file.endsWith('.performance.test.ts')
						? 'performance'
						: file.endsWith('.test-d.ts')
							? 'types'
							: 'unit',
		),
	)
	run(
		[
			'exec',
			'vitest',
			'run',
			...[...projects].flatMap((project) => ['--project', project]),
			'--maxWorkers=2',
			...runtimeFiles.map((file) => path.join(repositoryRoot, file)),
		],
		// Existing subprocess and generated-application fixtures resolve from the repository root.
		repositoryRoot,
	)
}
switch (process.argv[2]) {
	case 'repository': {
		const formatted = plan.changed.filter((file) => existsSync(file))
		if (plan.full) run(['format:check'])
		else if (formatted.length > 0)
			run(['prettier', '--check', '--ignore-unknown', '--', ...formatted])
		if (plan.issues && !plan.documentation && !plan.tooling && !plan.coverage)
			run(['check:issues'])
		if (plan.documentation) {
			// The complete tooling selection below already includes the documentation guards.
			if (!plan.tooling && !plan.coverage)
				run([
					'vitest',
					'run',
					'--project',
					'unit',
					'tooling/documentation/',
					'tooling/issues/',
				])
			// Landing example compilation depends on built exports, not documentation prose.
			run(
				plan.build
					? ['website:validate']
					: [
							'website:validate',
							'--exclude',
							'**/landing-samples.content.test.ts',
							'--exclude',
							'**/landing-stacks.content.test.ts',
						],
			)
		}
		if (plan.tooling && !plan.coverage)
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
		// Complete coverage already executes unit, type and performance suites once.
		tests(
			plan.coverage
				? selected.files.filter((file) => file.endsWith('.e2e.test.ts'))
				: selected.files,
			path.join(repositoryRoot, selected.directory),
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
		tests(
			plan.coverage
				? plan.transversal.filter((file) => file.endsWith('.e2e.test.ts'))
				: plan.transversal,
		)
		break
	}
	default:
		throw new Error('Expected repository, package, or transversal command')
}
