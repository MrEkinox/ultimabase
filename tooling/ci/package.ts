import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { selectCi } from './selection.ts'

/**
 * Runs the GitHub package job locally for one or more packages: the same
 * `run.ts package` command with every suite of the package selected, so its
 * own coverage thresholds apply. It checks the built packages, like CI: run
 * `yarn build` first.
 *
 * Usage: node tooling/ci/package.ts <name...> (`core` or `@ultimabase/core`)
 */
const names = process.argv.slice(2)
if (names.length === 0) {
	console.error('Usage: yarn validate:package <name...>')
	process.exit(1)
}
for (const input of names) {
	const directory = `packages/${input.replace(/^@ultimabase\//u, '')}`
	if (!existsSync(`${directory}/package.json`))
		throw new Error(`Unknown package: ${input}`)
	const name = `@ultimabase/${directory.slice('packages/'.length)}`
	const files = new Map(
		execFileSync('git', ['ls-files', '--', directory], { encoding: 'utf8' })
			.split('\n')
			.filter((file) => file !== '' && existsSync(file))
			.map((file) => [file, readFileSync(file, 'utf8')]),
	)
	const plan = selectCi({
		workspaces: [{ name, directory }],
		files,
		changed: [],
		affected: [name],
	})
	console.info(`\n> node tooling/ci/run.ts package (${name})`)
	const result = spawnSync('node', ['tooling/ci/run.ts', 'package'], {
		env: { ...process.env, CI_PLAN: JSON.stringify(plan), CI_PACKAGE: name },
		stdio: 'inherit',
	})
	if (result.error !== undefined) throw result.error
	if (result.status !== 0) process.exit(result.status ?? 1)
}
