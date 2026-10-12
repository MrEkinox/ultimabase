import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	graphqlExplorerPluginPublicApi,
	removedGraphqlExplorerPluginPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const moduleSpecifier = '../src/index.js'
const documentedSource = `
import { graphqlExplorerPlugin, type GraphqlExplorerPluginOptions } from '${moduleSpecifier}'
const options: GraphqlExplorerPluginOptions = { ui: 'graphiql', environment: 'production', allowInProduction: true, path: '/ide' }
graphqlExplorerPlugin(options)
`
const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	documentedSource,
	moduleSpecifier,
	removedNames: removedGraphqlExplorerPluginPublicApiNames,
})

describe('@ultimabase/graphql-explorer-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		expect(fixture.readExportCompletions()).toStrictEqual(
			getOptionalProductPublicApiNames(graphqlExplorerPluginPublicApi),
		)
	})

	it('keeps page and normalization details private', () => {
		const messages = fixture.readRemovedMessages()
		expect(messages).toHaveLength(
			removedGraphqlExplorerPluginPublicApiNames.length,
		)
	})

	it('documents the factory and every option in editor hovers', () => {
		expect(fixture.documentationAt('graphqlExplorerPlugin')).toContain(
			'Apollo Sandbox page',
		)
		expect(fixture.documentationAt('ui')).toContain('The explorer to serve')
		expect(fixture.documentationAt('environment')).toContain(
			'deployment environment',
		)
		expect(fixture.documentationAt('allowInProduction')).toContain(
			'permits the route',
		)
		expect(fixture.documentationAt('path')).toContain('route suffix')
	})
})
