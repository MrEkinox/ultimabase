// Type-checks the repository with the TypeScript 7 native compiler, pinned as
// the `typescript-7` alias beside TypeScript 6 (`typescript`), which the
// TypeScript JS API consumers (typescript-eslint, language-service tests,
// declaration bundling) keep using. Run by the `TypeScript 7` CI job and by
// `yarn typecheck:typescript-7` locally.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const compiler = path.join(
	path.dirname(
		createRequire(import.meta.url).resolve('typescript-7/package.json'),
	),
	'bin',
	'tsc',
)
// Reproduction cases of the `Register` cycle (ADR-0297, register-cycle note),
// each compiled from package sources and from built packages.
const registerCycleRoot = 'tests/register-cycle'
const registerCycleProjects = readdirSync(registerCycleRoot, {
	withFileTypes: true,
})
	.filter((entry) => entry.isDirectory())
	.map(({ name }) => name)
	.sort()
	.flatMap((name) => [
		path.join(registerCycleRoot, name, 'tsconfig.json'),
		path.join(registerCycleRoot, name, 'tsconfig.dist.json'),
	])
const checks: readonly (readonly string[])[] = [
	// Builds the packages first: the projects below read their declarations.
	['--build', 'tsconfig.json'],
	['--project', 'tooling/tsconfig/test-typescript-7.json'],
	['--project', 'examples/minimal/tsconfig.json'],
	['--project', 'examples/todo-backend/tsconfig.json'],
	['--project', 'examples/soft-delete/tsconfig.json'],
	['--project', 'examples/access/tsconfig.json'],
	['--project', 'examples/hooks/tsconfig.json'],
	['--project', 'examples/validation/tsconfig.json'],
	['--project', 'examples/roles/tsconfig.json'],
	['--project', 'examples/schema-form-d/tsconfig.json'],
	['--project', 'examples/schema-form-d/tsconfig.source.json'],
	...registerCycleProjects.map((project) => ['--project', project]),
]

const failed: string[] = []
for (const args of checks) {
	const started = performance.now()
	const result = spawnSync(process.execPath, [compiler, ...args], {
		stdio: 'inherit',
	})
	if (result.error !== undefined) throw result.error
	const seconds = ((performance.now() - started) / 1000).toFixed(1)
	console.info(
		`tsc ${args.join(' ')}: ${result.status === 0 ? 'ok' : 'failed'} (${seconds} s)`,
	)
	if (result.status !== 0) failed.push(args.join(' '))
}
if (failed.length > 0) {
	console.error(`TypeScript 7 reported errors in: ${failed.join(', ')}`)
	process.exitCode = 1
}
