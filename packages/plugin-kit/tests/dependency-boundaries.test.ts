import { glob, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const packageDirectory = path.resolve(import.meta.dirname, '..')
const repositoryRoot = path.resolve(packageDirectory, '../..')

describe('@ultimabase/plugin-kit dependency boundaries', () => {
	it('depends only on foundations and the types-only Standard Schema protocol', async () => {
		const manifestSource = await readFile(
			path.join(packageDirectory, 'package.json'),
			'utf8',
		)
		const parsed: unknown = JSON.parse(manifestSource)

		expect(parsed).toMatchObject({
			dependencies: {
				'@ultimabase/core': 'workspace:^',
				'@ultimabase/shared': 'workspace:^',
				'@standard-schema/spec': '^1.1.0',
			},
		})
		expect(
			Object.keys(
				(parsed as Readonly<{ dependencies: Readonly<Record<string, string>> }>)
					.dependencies,
			).sort(),
		).toStrictEqual([
			'@standard-schema/spec',
			'@ultimabase/core',
			'@ultimabase/shared',
		])
	})

	it('is never imported by Core', async () => {
		const coreSourceDirectory = path.join(repositoryRoot, 'packages/core/src')
		const sourceFiles: string[] = []
		for await (const sourceFile of glob('**/*.ts', {
			cwd: coreSourceDirectory,
		})) {
			sourceFiles.push(sourceFile)
		}
		const offenders: string[] = []

		for (const sourceFile of sourceFiles) {
			const source = await readFile(
				path.join(coreSourceDirectory, sourceFile),
				'utf8',
			)
			if (source.includes('@ultimabase/plugin-kit')) offenders.push(sourceFile)
		}

		expect(offenders).toStrictEqual([])
	})
})
