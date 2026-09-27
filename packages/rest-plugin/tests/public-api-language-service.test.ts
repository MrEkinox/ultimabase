import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	removedRestPluginPublicApiNames,
	restPluginPublicApi,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	moduleSpecifier: '../src/index.js',
	removedNames: removedRestPluginPublicApiNames,
})

describe('@ultimabase/rest-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		const expected = getOptionalProductPublicApiNames(restPluginPublicApi)

		expect(new Set(expected).size).toBe(expected.length)
		expect(fixture.readExportCompletions()).toStrictEqual(expected)
	})

	it('keeps route compiler internals private', () => {
		const messages = fixture.readRemovedMessages()

		expect(messages).toHaveLength(removedRestPluginPublicApiNames.length)
		for (const name of removedRestPluginPublicApiNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})
})
