import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	graphiqlPluginPublicApi,
	removedGraphiqlPluginPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const moduleSpecifier = '../src/index.js'
const documentedSource = `
import { graphiqlPlugin, type GraphiqlPluginOptions } from '${moduleSpecifier}'
const options: GraphiqlPluginOptions = { environment: 'production', allowInProduction: true, path: '/ide' }
graphiqlPlugin(options)
`
const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	documentedSource,
	moduleSpecifier,
	removedNames: removedGraphiqlPluginPublicApiNames,
})

describe('@ultimabase/graphiql-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		expect(fixture.readExportCompletions()).toStrictEqual(
			getOptionalProductPublicApiNames(graphiqlPluginPublicApi),
		)
	})

	it('keeps page and normalization details private', () => {
		const messages = fixture.readRemovedMessages()
		expect(messages).toHaveLength(removedGraphiqlPluginPublicApiNames.length)
	})

	it('documents the factory and every option in editor hovers', () => {
		expect(fixture.documentationAt('graphiqlPlugin')).toContain('GraphiQL page')
		expect(fixture.documentationAt('environment')).toContain(
			'deployment environment',
		)
		expect(fixture.documentationAt('allowInProduction')).toContain(
			'permits the route',
		)
		expect(fixture.documentationAt('path')).toContain('route suffix')
	})
})
