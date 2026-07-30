import { describe, expect, it } from 'vitest'

import * as runtimeApi from '@ultimabase/runtime'
import * as schemaApi from '@ultimabase/schema'

describe('cross-package public entry points', () => {
	it('loads multiple built packages through their export maps', () => {
		// E2E tests consume built public APIs instead of package source paths.
		const exportedKeys: string[][] = [
			Object.keys(schemaApi).sort(),
			Object.keys(runtimeApi),
		]

		expect(exportedKeys).toStrictEqual([
			[
				'defineExtensions',
				'defineFieldExtension',
				'defineSchemaExtension',
				'stringField',
			],
			[],
		])
	})
})
