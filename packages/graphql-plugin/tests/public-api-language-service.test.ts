import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	graphqlPluginPublicApi,
	removedGraphqlPluginPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	moduleSpecifier: '../src/index.js',
	removedNames: removedGraphqlPluginPublicApiNames,
})

describe('@ultimabase/graphql-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		const expected = getOptionalProductPublicApiNames(graphqlPluginPublicApi)

		expect(new Set(expected).size).toBe(expected.length)
		expect(fixture.readExportCompletions()).toStrictEqual(expected)
	})

	it('keeps structural compiler details private', () => {
		const messages = fixture.readRemovedMessages()

		expect(messages).toHaveLength(removedGraphqlPluginPublicApiNames.length)
		for (const name of removedGraphqlPluginPublicApiNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})
})
