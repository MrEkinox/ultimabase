import { describe, expect, it } from 'vitest'

import {
	accessPluginPublicApi,
	getOptionalProductPublicApiNames,
	removedAccessPluginPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	moduleSpecifier: '../src/index.js',
	removedNames: removedAccessPluginPublicApiNames,
})

describe('@ultimabase/access-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		const expected = getOptionalProductPublicApiNames(accessPluginPublicApi)

		expect(new Set(expected).size).toBe(expected.length)
		expect(fixture.readExportCompletions()).toStrictEqual(expected)
	})

	it('rejects removed implementation details at the root', () => {
		const messages = fixture.readRemovedMessages()

		expect(messages).toHaveLength(removedAccessPluginPublicApiNames.length)
		for (const name of removedAccessPluginPublicApiNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})
})
