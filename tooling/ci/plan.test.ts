import { execFileSync } from 'node:child_process'
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = path.join(import.meta.dirname, 'plan.ts')
const directories: string[] = []
afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true })
})
const repository = () => {
	const directory = mkdtempSync(path.join(tmpdir(), 'ultimabase-ci-plan-'))
	directories.push(directory)
	const git = (...args: string[]) =>
		execFileSync('git', args, {
			cwd: directory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim()
	git('init', '-b', 'main')
	git('config', 'user.name', 'CI planner test')
	git('config', 'user.email', 'ci-planner@example.invalid')
	writeFileSync(
		path.join(directory, 'package.json'),
		JSON.stringify({
			name: 'ci-fixture',
			private: true,
			packageManager: 'yarn@4.9.2',
			workspaces: ['packages/*'],
		}),
	)
	mkdirSync(path.join(directory, 'packages/core/src'), { recursive: true })
	writeFileSync(
		path.join(directory, 'packages/core/package.json'),
		JSON.stringify({ name: '@ultimabase/core' }),
	)
	writeFileSync(
		path.join(directory, 'packages/core/src/index.ts'),
		'export const value = 1',
	)
	writeFileSync(
		path.join(directory, 'packages/core/src/index.test.ts'),
		'/* suite */',
	)
	writeFileSync(path.join(directory, 'README.md'), '# Before')
	git('add', '.')
	git('commit', '-m', 'initial')
	const base = git('rev-parse', 'HEAD')
	return { directory, git, base }
}
const plan = (
	directory: string,
	base: string | undefined,
	full = false,
	suppliedChanges?: unknown,
) => {
	const outputPath = path.join(directory, '.output')
	// Model paths-filter's JSON output; Yarn itself still computes real Git workspace impact.
	let changed: unknown = suppliedChanges
	if (changed === undefined && base !== undefined) {
		try {
			changed = execFileSync(
				'git',
				['diff', '--name-only', '--no-renames', '-z', base, 'HEAD'],
				{ cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
			)
				.split('\0')
				.filter(Boolean)
		} catch {
			changed = null
		}
	}

	execFileSync(process.execPath, [script], {
		cwd: directory,
		encoding: 'utf8',
		env: {
			...process.env,
			CI_BASE_SHA: base ?? '',
			CI_CHANGED_FILES: JSON.stringify(changed ?? null),
			CI_FULL: String(full),
			GITHUB_OUTPUT: outputPath,
			GITHUB_STEP_SUMMARY: path.join(directory, '.summary'),
		},
	})
	const output = readFileSync(outputPath, 'utf8')
		.split('\n')
		.find((line) => line.startsWith('plan='))
	if (output === undefined)
		throw new TypeError('Planner did not publish a plan')
	const result: unknown = JSON.parse(output.slice(5))
	return result
}

describe('GitHub action input and Yarn selection', () => {
	it('delegates direct and transitive dependant selection to the pinned Yarn version', () => {
		const { directory, git } = repository()
		for (const [name, dependencies] of [
			['http', { '@ultimabase/core': 'workspace:*' }],
			['rest', { '@ultimabase/http': 'workspace:*' }],
			['unrelated', {}],
		] as const) {
			mkdirSync(path.join(directory, `packages/${name}`), { recursive: true })
			writeFileSync(
				path.join(directory, `packages/${name}/package.json`),
				JSON.stringify({ name: `@ultimabase/${name}`, dependencies }),
			)
		}
		git('add', '.')
		git('commit', '-m', 'dependants')
		const base = git('rev-parse', 'HEAD')
		writeFileSync(
			path.join(directory, 'packages/core/src/index.ts'),
			'export const value = 2',
		)
		git('commit', '-am', 'core')
		const result = plan(directory, base)
		expect(result).toMatchObject({
			full: false,
			packages: [
				{ name: '@ultimabase/core' },
				{ name: '@ultimabase/http' },
				{ name: '@ultimabase/rest' },
			],
		})
	})
	it('ignores package documentation even when another package changes', () => {
		const { directory, git } = repository()
		mkdirSync(path.join(directory, 'packages/other'), { recursive: true })
		writeFileSync(
			path.join(directory, 'packages/other/package.json'),
			JSON.stringify({ name: '@ultimabase/other' }),
		)
		git('add', '.')
		git('commit', '-m', 'unrelated package')
		const base = git('rev-parse', 'HEAD')
		writeFileSync(
			path.join(directory, 'packages/core/README.md'),
			'# Documentation',
		)
		writeFileSync(
			path.join(directory, 'packages/other/index.ts'),
			'export const value = 2',
		)
		git('add', '.')
		git('commit', '-m', 'code and unrelated docs')
		expect(plan(directory, base)).toMatchObject({
			full: false,
			packages: [{ name: '@ultimabase/other' }],
		})
	})
	it('uses every commit in the push rather than only HEAD~1', () => {
		const { directory, git, base } = repository()
		writeFileSync(
			path.join(directory, 'packages/core/src/index.ts'),
			'export const value = 2',
		)
		git('commit', '-am', 'code')
		writeFileSync(path.join(directory, 'README.md'), '# After')
		git('commit', '-am', 'docs')
		expect(plan(directory, base)).toMatchObject({
			full: false,
			build: true,
			changed: ['README.md', 'packages/core/src/index.ts'],
		})
	})
	it('keeps a docs-only action diff selective', () => {
		const { directory, git, base } = repository()
		writeFileSync(path.join(directory, 'README.md'), '# After')
		git('commit', '-am', 'docs')
		expect(plan(directory, base)).toMatchObject({
			full: false,
			packages: [],
			coverage: false,
		})
	})
	it('keeps deleted paths visible and falls back for removed tests', () => {
		const { directory, git, base } = repository()
		git('rm', 'packages/core/src/index.test.ts')
		git('commit', '-m', 'delete suite')
		expect(plan(directory, base)).toMatchObject({
			full: true,
			changed: ['packages/core/src/index.test.ts'],
		})
	})
	it.each(['0'.repeat(40), 'f'.repeat(40), 'invalid'])(
		'requires complete checks for unavailable base %s',
		(before) => {
			const { directory } = repository()
			expect(plan(directory, before)).toMatchObject({
				full: true,
				coverage: true,
			})
		},
	)
	it.each([null, {}, [42]])(
		'requires complete validation for invalid changed paths %j',
		(changed) => {
			const { directory, base } = repository()
			expect(plan(directory, base, false, changed)).toMatchObject({
				full: true,
				coverage: true,
			})
		},
	)
	it('does not require installing workspace dependencies for a complete plan', () => {
		const { directory } = repository()
		expect(plan(directory, undefined, true)).toMatchObject({
			full: true,
			build: true,
		})
	})
})
