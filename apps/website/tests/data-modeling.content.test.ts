import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from '@ultimabase/typegen'

import { dataModelingApplication } from './fixtures/data-modeling/application'

const generatedPath = fileURLToPath(
	new URL(
		'./fixtures/data-modeling/.ultimabase/schema.generated.d.ts',
		import.meta.url,
	),
)

describe('data modeling documentation contracts', () => {
	it('keeps the checked-in application declarations synchronized', async () => {
		try {
			const expected = await readFile(generatedPath, 'utf8')
			const generated = generateApplicationTypes({
				application: dataModelingApplication.application,
				applicationId: 'website-data-modeling',
			})

			expect(generated.contents).toBe(expected)
		} finally {
			await dataModelingApplication.dispose()
		}
	})
})
