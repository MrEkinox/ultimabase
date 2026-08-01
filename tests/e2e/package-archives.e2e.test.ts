import { packAsList } from '@publint/pack'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

interface PackageFixture {
	directory: string
	name: `@ultimabase/${string}`
}

interface SchemaOptionQuickInfo {
	readonly display: string
	readonly documentation: string
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
const schemaFixtureFile = path.join(
	repositoryRoot,
	'tests/e2e/runtime-postgres.postgres.e2e.test.ts',
)
const schemaFixtureSource = await readFile(schemaFixtureFile, 'utf8')
const schemaLanguageServiceHost: ts.LanguageServiceHost = {
	fileExists: (fileName) => ts.sys.fileExists(fileName),
	getCompilationSettings: () => ({
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		strict: true,
		target: ts.ScriptTarget.ESNext,
	}),
	getCurrentDirectory: () => repositoryRoot,
	getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
	getScriptFileNames: () => [schemaFixtureFile],
	getScriptSnapshot: (fileName) => {
		const contents =
			fileName === schemaFixtureFile
				? schemaFixtureSource
				: ts.sys.readFile(fileName)

		return contents === undefined
			? undefined
			: ts.ScriptSnapshot.fromString(contents)
	},
	getScriptVersion: () => '0',
	readFile: (fileName) => ts.sys.readFile(fileName),
}
const schemaLanguageService = ts.createLanguageService(
	schemaLanguageServiceHost,
)

const getResolutionError = (specifier: string): unknown => {
	try {
		consumerRequire.resolve(specifier)
	} catch (error: unknown) {
		return error
	}

	throw new Error(`Private package path unexpectedly resolved: ${specifier}`)
}

/** Reads editor QuickInfo through the same compiled package exports consumers use. */
const readSchemaOptionQuickInfo = (
	propertySource: string,
): SchemaOptionQuickInfo => {
	const position = schemaFixtureSource.indexOf(propertySource)

	if (position < 0) {
		throw new TypeError(`Missing schema hover fixture: ${propertySource}`)
	}

	const quickInfo = schemaLanguageService.getQuickInfoAtPosition(
		schemaFixtureFile,
		position,
	)

	return {
		display: quickInfo?.displayParts?.map(({ text }) => text).join('') ?? '',
		documentation:
			quickInfo?.documentation?.map(({ text }) => text).join('') ?? '',
	}
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

describe('@ultimabase/schema declaration artifact', () => {
	it('preserves field option documentation through package exports', () => {
		const validation = readSchemaOptionQuickInfo(
			'validation: { required: true }',
		)

		expect(validation.display).toContain('validation: StringValidationOptions')
		expect(validation.display).not.toContain(
			'FieldValidationOptions & StringValidationOptions',
		)
		expect(validation.documentation).toContain('Groups presence rules')
		expect(
			readSchemaOptionQuickInfo('required: true }').documentation,
		).toContain('Requires the field')
	})
})
