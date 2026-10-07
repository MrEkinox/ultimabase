import { describe, expect, it } from 'vitest'

import { normalizeGraphqlHttpEndpoint } from './endpoint.js'
import { graphqlHttpEndpointCapability } from './index.js'

describe('graphqlHttpEndpointCapability', () => {
	it('defines one application-local provider-neutral endpoint', () => {
		expect(graphqlHttpEndpointCapability).toMatchObject({
			capabilityId: 'ultimabase.graphql.http-endpoint',
			cardinality: 'single',
			lifetime: 'application',
			version: '1.0.0',
		})
	})

	it('snapshots one normalized same-origin path', () => {
		const provider = { path: '/api/graphql' }
		const endpoint = normalizeGraphqlHttpEndpoint(provider)

		expect(endpoint).toEqual({ path: '/api/graphql' })
		expect(endpoint).not.toBe(provider)
		expect(Object.isFrozen(endpoint)).toBe(true)
	})

	it.each([
		{},
		{ path: 'graphql' },
		{ path: '/graphql/' },
		{ path: '/graphql?debug=true' },
		{ path: '/graphql#schema' },
		{ path: '/graphql//nested' },
		{ path: '/graphql/%2Fadmin' },
		{ path: '/graphql/%2e%2e' },
		{ path: '/graphql/%invalid' },
		{ path: '/graphql', secret: 'must-not-cross-the-contract' },
	])('rejects an invalid endpoint value %#', (provider) => {
		expect(() => normalizeGraphqlHttpEndpoint(provider)).toThrow(TypeError)
	})
})
