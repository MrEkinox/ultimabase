import { execFileSync, spawnSync } from 'node:child_process'
import process from 'node:process'
import type { CiPlan } from './selection.ts'

/**
 * Runs the GitHub affected-check plan locally: the same planner and the same
 * `run.ts` commands, scoped to the changes since a base (default: the merge
 * base with `main`, including uncommitted and untracked files). A complete
 * plan falls back to `yarn validate:full`.
 *
 * Usage: node tooling/ci/local.ts [base-ref]
 */

/** Merges committed, uncommitted and untracked paths into one sorted list. */
export const collectChangedFiles = (
	...gitOutputs: readonly string[]
): string[] =>
	[
		...new Set(
			gitOutputs.flatMap((output) =>
				output
					.split('\n')
					.map((line) => line.trim())
					.filter(Boolean),
			),
		),
	].sort()

const git = (args: readonly string[]): string =>
	execFileSync('git', [...args], { encoding: 'utf8' })

const yarn = (args: readonly string[], env?: NodeJS.ProcessEnv): void => {
	console.info(`\n> yarn ${args.join(' ')}`)
	const result = spawnSync('yarn', [...args], {
		env: { ...process.env, ...env },
		stdio: 'inherit',
	})
	if (result.error !== undefined) throw result.error
	if (result.status !== 0) {
		throw new Error(
			`Command failed (${String(result.status)}): ${args.join(' ')}`,
		)
	}
}

const main = (): void => {
	const base = git(['merge-base', 'HEAD', process.argv[2] ?? 'main']).trim()
	const changed = collectChangedFiles(
		git(['diff', '--name-only', base]),
		git(['ls-files', '--others', '--exclude-standard']),
	)
	if (changed.length === 0) {
		console.info('No change since the base: nothing to validate.')
		return
	}
	const output = execFileSync('node', ['tooling/ci/plan.ts'], {
		encoding: 'utf8',
		env: {
			...process.env,
			CI_BASE_SHA: base,
			CI_CHANGED_FILES: JSON.stringify(changed),
		},
	})
	const plan = JSON.parse(output) as CiPlan
	if (plan.full) {
		console.info('Shared inputs changed: running the complete gate.')
		yarn(['validate:full'])
		return
	}
	console.info(
		`Affected packages: ${plan.packages.map(({ name }) => name).join(', ') || 'none'}; transversal suites: ${String(plan.transversal.length)}`,
	)
	const env = { CI_PLAN: JSON.stringify(plan) }
	if (plan.build) {
		yarn(['tsc', '--build', 'tsconfig.json'])
		yarn(['build'])
	}
	yarn(['node', 'tooling/ci/run.ts', 'repository'], env)
	for (const { name } of plan.packages) {
		yarn(['node', 'tooling/ci/run.ts', 'package'], { ...env, CI_PACKAGE: name })
	}
	if (plan.transversal.length > 0 || plan.workspaceLint.length > 0) {
		yarn(['node', 'tooling/ci/run.ts', 'transversal'], env)
	}
	if (plan.website) {
		yarn(['website:typecheck'])
		yarn(['website:lint'])
	}
	yarn(['constraints'])
	console.info(
		'\nAffected validation passed. Run `yarn validate:full` before merging into main.',
	)
}

if (import.meta.main) main()
