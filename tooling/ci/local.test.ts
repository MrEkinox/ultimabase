import { describe, expect, it } from 'vitest'

import { collectChangedFiles } from './local.ts'

describe('local affected validation', () => {
	it('merges committed, uncommitted and untracked paths once, sorted', () => {
		expect(
			collectChangedFiles(
				'packages/core/src/a.ts\nREADME.md\n',
				'  packages/core/src/a.ts \npackages/rest-plugin/src/b.ts\n\n',
			),
		).toStrictEqual([
			'README.md',
			'packages/core/src/a.ts',
			'packages/rest-plugin/src/b.ts',
		])
	})

	it('returns no path when nothing changed', () => {
		expect(collectChangedFiles('', '\n')).toStrictEqual([])
	})
})
