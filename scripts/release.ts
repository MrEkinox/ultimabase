// Publishes the packages from CI (D-156), safe to rerun: a version npm
// already has is skipped, a release GitHub already has is kept.
//
//   node scripts/release.ts canary   the pending changesets as a snapshot,
//                                    `0.1.2-canary.<datetime>`, under `canary`
//   node scripts/release.ts stable   each version npm lacks, under `latest`,
//                                    then the version's tag and GitHub release
//
// Yarn packs each package, which writes `workspace:*` out and applies
// `publishConfig`; npm publishes the pack, since only npm authenticates with
// the workflow's OIDC token (trusted publishing) and signs its provenance.
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { gte } from 'semver'
import { releaseNotes } from './release-notes.ts'

type Result = { readonly ok: boolean; readonly output: string }

/** Runs a command to its end, whether it fails or not. */
const attempt = (command: string, args: readonly string[]): Promise<Result> =>
	new Promise((done) => {
		execFile(
			command,
			args,
			{ maxBuffer: 64 * 1024 * 1024 },
			(error, stdout, stderr) => {
				done({ ok: error === null, output: `${stdout}${stderr}` })
			},
		)
	})

/** Runs a command to its end; its output is shown when it fails. */
const run = async (command: string, args: readonly string[]) => {
	const result = await attempt(command, args)
	if (!result.ok) {
		throw new Error(`${command} ${args.join(' ')}\n${result.output}`)
	}
	return result.output.trim()
}

type Package = {
	readonly directory: string
	readonly name: string
	readonly version: string
}

/** The published packages, as `packages/` holds them now. */
const packages = (): Package[] =>
	readdirSync('packages', { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap(({ name: directory }) => {
			const manifest: unknown = JSON.parse(
				readFileSync(join('packages', directory, 'package.json'), 'utf8'),
			)
			const read = (field: string): unknown =>
				Reflect.get(Object(manifest), field)
			const name = read('name')
			const version = read('version')
			if (typeof name !== 'string' || typeof version !== 'string') {
				throw new TypeError(`packages/${directory} has no name or version.`)
			}
			return read('private') === true ? [] : [{ directory, name, version }]
		})

/** Whether npm serves this version; any answer but "not found" throws. */
const published = async ({ name, version }: Package): Promise<boolean> => {
	const result = await attempt('npm', [
		'view',
		`${name}@${version}`,
		'version',
		'--prefer-online',
	])
	if (result.ok) return result.output.trim() === version
	if (result.output.includes('E404')) return false
	throw new Error(`npm view ${name}@${version}\n${result.output}`)
}

/** Packs and publishes a version npm lacks, three tries at most. */
const publish = async (pkg: Package, tag: string, packs: string) => {
	const label = `${pkg.name}@${pkg.version}`
	if (await published(pkg)) {
		console.log(`${label} is on npm already.`)
		return
	}
	const file = join(packs, `${pkg.directory}.tgz`)
	await run('yarn', ['workspace', pkg.name, 'pack', '--out', file])
	const args = ['publish', file, '--access', 'public', '--provenance']
	for (let tries = 1; tries <= 3; tries += 1) {
		const result = await attempt('npm', [...args, '--tag', tag])
		if (result.ok) {
			console.log(`Published ${label} under ${tag}.`)
			return
		}
		// npm took an earlier try it did not confirm.
		if (/EPUBLISHCONFLICT|cannot publish over/u.test(result.output)) {
			console.log(`${label} is on npm already.`)
			return
		}
		console.log(`Publishing ${label} failed (try ${tries}):\n${result.output}`)
		await setTimeout(tries * 10_000)
	}
	throw new Error(`Could not publish ${label}.`)
}

const publishAll = async (tag: string): Promise<Package[]> => {
	const npm = await run('npm', ['--version'])
	// The first npm that publishes with the workflow's OIDC token.
	if (!gte(npm, '11.5.1')) throw new Error(`npm ${npm} cannot use OIDC.`)
	const all = packages()
	const packs = mkdtempSync(join(tmpdir(), 'ultimabase-release-'))
	// One after the other, so that a failure stops before the next package.
	for (const pkg of all) await publish(pkg, tag, packs)
	return all
}

const canary = async () => {
	const pending = readdirSync('.changeset').filter(
		(file) => file.endsWith('.md') && file !== 'README.md',
	)
	if (pending.length === 0) {
		console.log('No pending changeset: no canary.')
		return
	}
	await run('yarn', ['changeset', 'version', '--snapshot', 'canary'])
	await publishAll('canary')
}

const stable = async () => {
	const all = await publishAll('latest')
	const version = all.find(({ name }) => name === 'ultimabase')?.version
	if (version === undefined) throw new Error('No ultimabase package.')
	const tag = `v${version}`
	if ((await attempt('gh', ['release', 'view', tag])).ok) {
		console.log(`The release ${tag} exists already.`)
		return
	}
	const notes = join(
		mkdtempSync(join(tmpdir(), 'ultimabase-notes-')),
		'notes.md',
	)
	writeFileSync(
		notes,
		releaseNotes(
			version,
			all.map(({ directory, name }) => ({
				name,
				text: readFileSync(join('packages', directory, 'CHANGELOG.md'), 'utf8'),
			})),
		),
	)
	// GitHub tags the commit unless the tag exists already.
	const target = await run('git', ['rev-parse', 'HEAD'])
	await run('gh', [
		'release',
		'create',
		tag,
		'--title',
		tag,
		'--notes-file',
		notes,
		'--target',
		target,
	])
	console.log(`Released ${tag}.`)
}

const mode = process.argv[2]
if (mode === 'canary') await canary()
else if (mode === 'stable') await stable()
else throw new Error('Usage: node scripts/release.ts canary|stable')
