import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	httpPluginPublicApi,
	removedHttpPluginPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	moduleSpecifier: '../src/index.js',
	removedNames: removedHttpPluginPublicApiNames,
})

describe('@ultimabase/http-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		const expected = getOptionalProductPublicApiNames(httpPluginPublicApi)

		expect(new Set(expected).size).toBe(expected.length)
		expect(fixture.readExportCompletions()).toStrictEqual(expected)
	})

	it('rejects assembly implementation details at the root', () => {
		const messages = fixture.readRemovedMessages()

		expect(messages).toHaveLength(removedHttpPluginPublicApiNames.length)
		for (const name of removedHttpPluginPublicApiNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})
})
