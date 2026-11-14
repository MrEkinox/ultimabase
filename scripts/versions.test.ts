// Every package of the repository is published at the kernel's version, and
// a package's `ultimabase` range accepts it (D-95), as a peer (D-96). From
// 1.0, a breaking changeset bumps a major version (D-397).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { major, satisfies } from 'semver'
import { expect, it } from 'vitest'

type Package = {
	readonly directory: string
	readonly name: string
	readonly version: string
	readonly exports?: unknown
	readonly dependencies?: { readonly ultimabase?: string }
	readonly peerDependencies?: { readonly ultimabase?: string }
}
const isPackage = (value: unknown): value is Package =>
	typeof value === 'object' && value !== null && 'version' in value

const packages = readdirSync('packages', { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map(({ name: directory }): Package => {
		const read: unknown = JSON.parse(
			readFileSync(join('packages', directory, 'package.json'), 'utf8'),
		)
		if (!isPackage(read)) throw new TypeError(`${directory} has no version.`)
		return { ...read, directory }
	})
const kernel = packages.find(({ name }) => name === 'ultimabase')

it('publishes every package at the version of the kernel', () => {
	expect(packages.map(({ name, version }) => [name, version])).toEqual(
		packages.map(({ name }) => [name, kernel?.version]),
	)
})

it('gives each package a kernel range that accepts the kernel', () => {
	const refused = packages.filter(
		({ peerDependencies }) =>
			peerDependencies?.ultimabase !== undefined &&
			!satisfies(kernel?.version ?? '', peerDependencies.ultimabase, {
				includePrerelease: true,
			}),
	)
	expect(refused).toEqual([])
})

/** Whether the code `directory` publishes imports the kernel. */
const importsKernel = (directory: string): boolean =>
	readdirSync(join('packages', directory, 'src'), { recursive: true })
		.map(String)
		.filter(
			(file) =>
				file.endsWith('.ts') &&
				!file.endsWith('.test.ts') &&
				!file.startsWith('test/'),
		)
		.some((file) =>
			/from 'ultimabase['/]/.test(
				readFileSync(join('packages', directory, 'src', file), 'utf8'),
			),
		)

/** The pending changesets: each file, its header and its text. */
const changesets = readdirSync('.changeset')
	.filter((file) => file.endsWith('.md') && file !== 'README.md')
	.map((file) => {
		const [, header = '', ...text] = readFileSync(
			join('.changeset', file),
			'utf8',
		).split('---\n')
		return { file, header, text: text.join('---\n') }
	})

// A changeset naming a package outside the workspace fails the release on
// `main` only, once merged, so a pull request checks the names.
it('names a package of the repository in every changeset', () => {
	const names = new Set(packages.map(({ name }) => name))
	const unknown = changesets.flatMap(({ file, header }) =>
		header
			.split('\n')
			.map((line) => /^['"]?([^'":]+)['"]?:/.exec(line)?.[1])
			.filter((name) => name !== undefined && !names.has(name))
			.map((name) => `${file}: ${name}`),
	)
	expect(unknown).toEqual([])
})

const bumpsMajor = (header: string): boolean => /:\s*major\s*$/m.test(header)

// From 1.0, what breaks an application is a major version (D-397).
it('bumps a major version for every breaking changeset from 1.0', () => {
	const stable = major(kernel?.version ?? '0.0.0') >= 1
	const minor = changesets.filter(
		({ header, text }) =>
			stable && /^Breaking:/m.test(text) && !bumpsMajor(header),
	)
	expect(minor.map(({ file }) => file)).toEqual([])
})

// The upgrade page tells what a pending major version breaks (D-397).
it('gives a pending major version its section in the upgrade page', () => {
	const next = major(kernel?.version ?? '0.0.0') + 1
	const page = readFileSync('website/content/docs/upgrading.mdx', 'utf8')
	const missing = changesets.some(({ header }) => bumpsMajor(header))
		? !new RegExp(`^## To ${String(next)}\\.0, from `, 'm').test(page)
		: false
	expect(
		missing && `upgrading.mdx has no "## To ${String(next)}.0, from …"`,
	).toBe(false)
})

// A bin, such as create-ultimabase, or a browser client, such as
// @ultimabase/live, imports no kernel.
it('makes the kernel a peer of every package that imports it, never a dependency', () => {
	const bound = packages.filter(
		({ directory, name, dependencies, peerDependencies }) =>
			name !== 'ultimabase' &&
			(dependencies?.ultimabase !== undefined ||
				(peerDependencies?.ultimabase === undefined &&
					importsKernel(directory))),
	)
	expect(bound.map(({ name }) => name)).toEqual([])
})
