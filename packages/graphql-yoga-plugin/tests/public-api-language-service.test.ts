import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	graphqlYogaPluginPublicApi,
	removedGraphqlYogaPluginPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const moduleSpecifier = '../src/index.js'
const documentedSource = `
import { graphqlYogaPlugin, type GraphqlYogaPluginOptions } from '${moduleSpecifier}'
const options: GraphqlYogaPluginOptions = {
  bodyLimit: 1024,
  introspection: true,
  path: '/graphql',
}
graphqlYogaPlugin(options)
`
const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	documentedSource,
	moduleSpecifier,
	removedNames: removedGraphqlYogaPluginPublicApiNames,
})

describe('@ultimabase/graphql-yoga-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		const expected = getOptionalProductPublicApiNames(
			graphqlYogaPluginPublicApi,
		)

		expect(new Set(expected).size).toBe(expected.length)
		expect(fixture.readExportCompletions()).toStrictEqual(expected)
	})

	it('keeps protocol implementation details private', () => {
		const messages = fixture.readRemovedMessages()

		expect(messages).toHaveLength(removedGraphqlYogaPluginPublicApiNames.length)
		for (const name of removedGraphqlYogaPluginPublicApiNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})

	it('documents the factory and each accepted option in editor hovers', () => {
		expect(fixture.documentationAt('graphqlYogaPlugin')).toContain(
			'Mounts one explicit GraphQL sibling',
		)
		expect(fixture.documentationAt('bodyLimit')).toContain('streamed JSON')
		expect(fixture.documentationAt('introspection')).toContain(
			'schema introspection',
		)
		expect(fixture.documentationAt('path')).toContain('mount path')
	})
})
