// Every package of the repository is published at the kernel's version, and
// a package's `ultimabase` range accepts it (D-95), as a peer (D-96).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { satisfies } from 'semver'
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
		.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
		.some((file) =>
			/from 'ultimabase['/]/.test(
				readFileSync(join('packages', directory, 'src', file), 'utf8'),
			),
		)

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
