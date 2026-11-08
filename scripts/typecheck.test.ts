import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { paths, programs } from './typecheck.ts'

const declarations = resolve('node_modules/.cache/typecheck/declarations')

it('reads each export of a package from its declaration', () => {
	const packages = mkdtempSync(join(tmpdir(), 'typecheck-'))
	const manifest = (directory: string, value: object) => {
		mkdirSync(join(packages, directory))
		writeFileSync(
			join(packages, directory, 'package.json'),
			JSON.stringify(value),
		)
	}
	manifest('files', {
		name: '@ultimabase/files',
		exports: { '.': './src/index.ts', './client': './src/client.ts' },
	})
	manifest('create-ultimabase', { name: 'create-ultimabase' })
	writeFileSync(join(packages, '.DS_Store'), '')
	expect(programs(packages).toSorted()).toStrictEqual([
		'create-ultimabase',
		'files',
	])
	expect(paths(packages)).toStrictEqual({
		'@ultimabase/files': [join(declarations, 'files/src/index.d.ts')],
		'@ultimabase/files/client': [join(declarations, 'files/src/client.d.ts')],
	})
})

it('reads every export of this repository from its declaration', () => {
	const imports = paths('packages')
	expect(imports['ultimabase']).toStrictEqual([
		join(declarations, 'ultimabase/src/index.d.ts'),
	])
	expect(imports['@ultimabase/live/react']).toStrictEqual([
		join(declarations, 'live/src/react.d.ts'),
	])
})
