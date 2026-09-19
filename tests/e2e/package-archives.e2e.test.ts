import { packAsList } from '@publint/pack'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageFixture {
	directory: string
	name: `@ultimabase/${string}`
}

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const packagesDirectory = path.join(repositoryRoot, 'packages')
const packageEntries = await readdir(packagesDirectory, { withFileTypes: true })
const packageFixtures: PackageFixture[] = packageEntries
	.filter(
		(entry): boolean =>
			entry.isDirectory() &&
			existsSync(path.join(packagesDirectory, entry.name, 'package.json')),
	)
	.map((entry): PackageFixture => ({
		directory: path.join(packagesDirectory, entry.name),
		name: `@ultimabase/${entry.name}`,
	}))
	.sort((left, right): number => left.name.localeCompare(right.name))

it('omits the removed ACL PostgreSQL bridge from the packed workspace inventory', () => {
	expect(packageFixtures.map(({ name }) => name)).not.toContain(
		'@ultimabase/acl-postgres-plugin',
	)
	expect(existsSync(path.join(packagesDirectory, 'acl-postgres-plugin'))).toBe(
		false,
	)
})

const rootLicense = await readFile(path.join(repositoryRoot, 'LICENSE'), 'utf8')
const consumerRequire = createRequire(import.meta.url)
const getResolutionError = (specifier: string): unknown => {
	try {
		consumerRequire.resolve(specifier)
	} catch (error: unknown) {
		return error
	}

	throw new Error(`Private package path unexpectedly resolved: ${specifier}`)
}

/** Reads only the published dependency map from an untrusted package manifest. */
const readPublishedDependencies = async (
	directory: string,
): Promise<Readonly<Record<string, unknown>>> => {
	const manifest: unknown = JSON.parse(
		await readFile(path.join(directory, 'package.json'), 'utf8'),
	)
	const dependencies: unknown =
		typeof manifest === 'object' && manifest !== null
			? Reflect.get(manifest, 'dependencies')
			: undefined

	if (typeof dependencies !== 'object' || dependencies === null) {
		return {}
	}

	return dependencies as Readonly<Record<string, unknown>>
}

/** Reads editor QuickInfo through the same compiled package exports consumers use. */
describe.each(packageFixtures)('$name archive', ({ directory, name }) => {
	it('contains only public distribution files', async () => {
		// publint's pack helper asks Yarn for the exact publish file list.
		const files = (
			await packAsList(directory, { packageManager: 'yarn' })
		).sort()
		const requiredFiles = ['README.md', 'dist/LICENSE', 'package.json']
		// CHANGELOG.md becomes present after the package receives its first version.
		const unexpectedFiles = files.filter(
			(file): boolean =>
				file !== 'CHANGELOG.md' &&
				file !== 'README.md' &&
				file !== 'package.json' &&
				!file.startsWith('dist/'),
		)

		expect(files).toEqual(expect.arrayContaining(requiredFiles))
		expect(unexpectedFiles).toStrictEqual([])
		expect(
			await readFile(path.join(directory, 'dist', 'LICENSE'), 'utf8'),
		).toBe(rootLicense)
	})

	it('exposes its root while keeping source paths private', async () => {
		// The repository test suite is an external consumer of workspace export maps.
		await expect(import(name)).resolves.toBeTypeOf('object')
		expect(getResolutionError(`${name}/src/index.js`)).toMatchObject({
			code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
		})
	})
})

it('publishes Standard Schema only from validator-owning packages', async () => {
	const dependencies = new Map(
		await Promise.all(
			packageFixtures.map(
				async ({ directory, name }) =>
					[name, await readPublishedDependencies(directory)] as const,
			),
		),
	)

	expect(dependencies.get('@ultimabase/core')).not.toHaveProperty(
		'@standard-schema/spec',
	)
	expect(dependencies.get('@ultimabase/plugin-kit')).toHaveProperty(
		'@standard-schema/spec',
	)
	expect(dependencies.get('@ultimabase/validation-plugin')).toHaveProperty(
		'@standard-schema/spec',
	)
	expect(dependencies.get('@ultimabase/roles-plugin')).not.toHaveProperty(
		'@standard-schema/spec',
	)

	for (const [name, published] of dependencies) {
		expect(published, `${name} production dependencies`).not.toHaveProperty(
			'zod',
		)
		expect(published, `${name} production dependencies`).not.toHaveProperty(
			'valibot',
		)
	}
})
