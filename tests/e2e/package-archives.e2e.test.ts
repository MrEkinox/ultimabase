import { packAsList } from '@publint/pack'
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
	.filter((entry): boolean => entry.isDirectory())
	.map((entry): PackageFixture => ({
		directory: path.join(packagesDirectory, entry.name),
		name: `@ultimabase/${entry.name}`,
	}))
	.sort((left, right): number => left.name.localeCompare(right.name))
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
