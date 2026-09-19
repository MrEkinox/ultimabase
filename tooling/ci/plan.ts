import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { selectCi, type Workspace } from './selection.ts'

const record = (value: unknown): Record<string, unknown> => {
	if (typeof value !== 'object' || value === null || Array.isArray(value))
		throw new TypeError('Expected an object')
	return value as Record<string, unknown>
}
const git = (args: readonly string[]) =>
	execFileSync('git', [...args], {
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'pipe'],
	})
const paths = git(['ls-files', '-z']).split('\0').filter(Boolean)
const files = new Map(
	paths
		.filter(
			(file) =>
				existsSync(file) &&
				/\.(?:[cm]?ts|tsx|[cm]?js|jsx|json|md|mdx|yml|yaml)$/u.test(file),
		)
		.map((file) => [file, readFileSync(file, 'utf8')]),
)
const listWorkspaces = (args: readonly string[] = []): Workspace[] =>
	execFileSync('yarn', ['workspaces', 'list', '--json', ...args], {
		encoding: 'utf8',
		// Scope this exclusion to CI; local Yarn configuration and commands stay unchanged.
		env: {
			...process.env,
			YARN_CHANGESET_IGNORE_PATTERNS:
				'**/*.md,**/*.mdx,apps/website/content/**',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	})
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const workspace = record(JSON.parse(line))
			if (
				typeof workspace.name !== 'string' ||
				typeof workspace.location !== 'string'
			)
				throw new TypeError('Invalid Yarn workspace')
			return { name: workspace.name, directory: workspace.location }
		})
		.filter(({ directory }) => directory.startsWith('packages/'))
const workspaces = listWorkspaces()
const base = process.env.CI_BASE_SHA
let full = process.env.CI_FULL === 'true' || process.argv.includes('--full')
let changed: string[] = []
try {
	const input: unknown = JSON.parse(process.env.CI_CHANGED_FILES ?? 'null')
	if (
		!Array.isArray(input) ||
		!input.every((file: unknown) => typeof file === 'string')
	)
		throw new TypeError('Missing changed paths from paths-filter')
	changed = input
	if (base === undefined || !/^[a-f0-9]{40}$/u.test(base) || /^0+$/u.test(base))
		throw new Error('No usable diff base')
	git(['merge-base', base, 'HEAD'])
} catch {
	// Missing action output or Git history must never silently skip validation.
	full = true
}
let plan = selectCi({ workspaces, files, changed, full, affected: [] })
if (!plan.full && base !== undefined) {
	const affected = listWorkspaces([`--since=${base}`, '--recursive']).map(
		({ name }) => name,
	)
	plan = selectCi({ workspaces, files, changed, affected })
}
console.info(JSON.stringify(plan, null, 2))
if (process.env.GITHUB_OUTPUT !== undefined) {
	for (const [name, value] of Object.entries({
		plan,
		packages: plan.packages.map(({ name, directory, browser }) => ({
			name,
			directory,
			browser,
		})),
		build: plan.build,
		transversal: plan.transversal.length > 0 || plan.workspaceLint.length > 0,
		coverage: plan.coverage,
		website: plan.website,
	})) {
		appendFileSync(
			process.env.GITHUB_OUTPUT,
			`${name}=${JSON.stringify(value)}\n`,
		)
	}
}
if (process.env.GITHUB_STEP_SUMMARY !== undefined)
	appendFileSync(
		process.env.GITHUB_STEP_SUMMARY,
		`## Selected validation\n\nFull validation: ${String(plan.full)}\n\nPackages: ${plan.packages.map(({ name }) => name).join(', ') || 'none'}\n\nTransversal suites: ${String(plan.transversal.length)}\n`,
	)
