import { describe, expect, it } from 'vitest'

import {
	apolloSandboxPluginPublicApi,
	getOptionalProductPublicApiNames,
	removedApolloSandboxPluginPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const moduleSpecifier = '../src/index.js'
const documentedSource = `
import { apolloSandboxPlugin, type ApolloSandboxPluginOptions } from '${moduleSpecifier}'
const options: ApolloSandboxPluginOptions = { environment: 'production', allowInProduction: true, path: '/ide' }
apolloSandboxPlugin(options)
`
const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	documentedSource,
	moduleSpecifier,
	removedNames: removedApolloSandboxPluginPublicApiNames,
})

describe('@ultimabase/apollo-sandbox-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		expect(fixture.readExportCompletions()).toStrictEqual(
			getOptionalProductPublicApiNames(apolloSandboxPluginPublicApi),
		)
	})

	it('keeps page and normalization details private', () => {
		const messages = fixture.readRemovedMessages()
		expect(messages).toHaveLength(
			removedApolloSandboxPluginPublicApiNames.length,
		)
	})

	it('documents the factory and every option in editor hovers', () => {
		expect(fixture.documentationAt('apolloSandboxPlugin')).toContain(
			'Sandbox page',
		)
		expect(fixture.documentationAt('environment')).toContain(
			'deployment environment',
		)
		expect(fixture.documentationAt('allowInProduction')).toContain(
			'permits the route',
		)
		expect(fixture.documentationAt('path')).toContain('route suffix')
	})
})
