import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	hooksPluginPublicApi,
	removedHooksPluginPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	moduleSpecifier: '../src/index.js',
	removedNames: removedHooksPluginPublicApiNames,
})

describe('@ultimabase/hooks-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		const expected = getOptionalProductPublicApiNames(hooksPluginPublicApi)

		expect(new Set(expected).size).toBe(expected.length)
		expect(fixture.readExportCompletions()).toStrictEqual(expected)
	})

	it('rejects removed implementation details at the root', () => {
		const messages = fixture.readRemovedMessages()

		expect(messages).toHaveLength(removedHooksPluginPublicApiNames.length)
		for (const name of removedHooksPluginPublicApiNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})
})
