import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	graphqlHttpPublicApi,
	removedGraphqlHttpPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	moduleSpecifier: '../src/index.js',
	removedNames: removedGraphqlHttpPublicApiNames,
})

describe('@ultimabase/graphql-http source declarations', () => {
	it('classifies its complete provider-neutral root surface', () => {
		expect(fixture.readExportCompletions()).toStrictEqual(
			getOptionalProductPublicApiNames(graphqlHttpPublicApi),
		)
	})

	it('keeps validation internals private', () => {
		const messages = fixture.readRemovedMessages()
		expect(messages).toHaveLength(removedGraphqlHttpPublicApiNames.length)
	})
})
