import { describe, expect, it } from 'vitest'

import {
	apiServerPublicApi,
	getOptionalProductPublicApiNames,
	removedApiServerPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const moduleSpecifier = '../src/index.js'
const documentedSource = `
import { apiServer, type ApiServerOptions } from '${moduleSpecifier}'
const options: ApiServerOptions = { rest: true, graphql: { explorer: 'graphiql' }, http: {}, server: { port: 3000 } }
apiServer(options)
`
const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	documentedSource,
	moduleSpecifier,
	removedNames: removedApiServerPublicApiNames,
})

describe('@ultimabase/api-server source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		expect(fixture.readExportCompletions()).toStrictEqual(
			getOptionalProductPublicApiNames(apiServerPublicApi),
		)
	})

	it('keeps implementation details private', () => {
		expect(fixture.readRemovedMessages()).toHaveLength(
			removedApiServerPublicApiNames.length,
		)
	})

	it('documents the preset and every option in editor hovers', () => {
		expect(fixture.documentationAt('apiServer')).toContain(
			'Returns the plugins of a REST and GraphQL API server',
		)
		expect(fixture.documentationAt('rest')).toContain('Installs REST')
		expect(fixture.documentationAt('graphql')).toContain('Installs GraphQL')
		expect(fixture.documentationAt('http')).toContain('HTTP foundation')
		expect(fixture.documentationAt('server')).toContain('Hono server')
	})
})
