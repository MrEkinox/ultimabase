import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	graphqlHttpPublicApi,
	removedGraphqlHttpPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = path.join(import.meta.dirname, 'public-api.fixture.ts')
const moduleSpecifier = '../src/index.js'

describe('@ultimabase/graphql-http source declarations', () => {
	it('classifies its complete provider-neutral root surface', () => {
		const marker = '/* exports */'
		const source = `import { ${marker} } from '${moduleSpecifier}'`
		const completions =
			createLanguageService(fixtureFile, source)
				.getCompletionsAtPosition(fixtureFile, source.indexOf(marker), {})
				?.entries.map(({ name }) => name)
				.filter((name) => name !== 'type')
				.sort() ?? []
		expect(completions).toStrictEqual(
			getOptionalProductPublicApiNames(graphqlHttpPublicApi),
		)
	})

	it('keeps validation internals private', () => {
		const source = `import { ${removedGraphqlHttpPublicApiNames.join(', ')} } from '${moduleSpecifier}'`
		const messages = createLanguageService(fixtureFile, source)
			.getSemanticDiagnostics(fixtureFile)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, ' '),
			)
		expect(messages).toHaveLength(removedGraphqlHttpPublicApiNames.length)
	})
})
