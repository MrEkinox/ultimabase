import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/http-plugin public entry point', () => {
	it('exports only HTTP authoring and compatible-provider contracts', () => {
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'dispatchHttpApplicationRequest',
			'dispatchHttpBrowserRequest',
			'httpApplicationCapability',
			'httpApplicationIdHeader',
			'httpApplicationProtocolVersion',
			'httpBrowserBootstrapPathPrefix',
			'httpBrowserBootstrapRoute',
			'httpBrowserPolicyCapability',
			'httpContextResolver',
			'httpContextResolverContributionsCapability',
			'httpEndpointContributionsCapability',
			'httpMasterKeyHeader',
			'httpMount',
			'httpOriginalHeaderMode',
			'httpPlugin',
			'httpPreDispatchErrorCodes',
			'httpRequestIdHeader',
			'httpRoute',
			'provideHttpContextResolvers',
			'provideHttpEndpoints',
		])
	})
})
