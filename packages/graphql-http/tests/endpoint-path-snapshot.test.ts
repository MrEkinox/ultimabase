import {
	contributeApplication,
	plugin,
	provideCapability,
	requireCapability,
	UltimaBase,
} from '@ultimabase/core'
import { describe, expect, it, onTestFinished } from 'vitest'

import {
	graphqlHttpEndpointCapability,
	type GraphqlHttpEndpoint,
} from '../src/index.js'

// Regression for a reference defect (documented in docs/rebuild/DIFFERENCES.md):
// the reference read the provider's `path` once to validate it and a second
// time to snapshot it. A provider value whose `path` getter returned a valid
// path first and another string second exposed the unvalidated second value to
// consumers such as GraphiQL and Apollo Sandbox, which embed it in HTML. The
// rebuild reads `path` once and snapshots exactly the validated value.

describe('GraphQL HTTP endpoint path snapshot (reference defect regression)', () => {
	it('reads path once and gives consumers the validated value', async () => {
		const reads: string[] = []
		const answers = ['/ok', '/</script>']
		// An accessor property is a plain-object own key, so it passes the shape
		// check exactly like an ordinary provider value.
		const forged: GraphqlHttpEndpoint = {
			get path(): string {
				const value = answers[Math.min(reads.length, answers.length - 1)]
				if (value === undefined) throw new TypeError('Expected an answer')
				reads.push(value)
				return value
			},
		}
		const provider = plugin({
			contributions: [
				provideCapability(graphqlHttpEndpointCapability, {
					contributionId: 'forged-endpoint',
					create: () => ({ value: forged }),
				}),
			],
			core: '^0.0.0',
			id: 'fixture.graphql-http-forged-provider',
			version: '1.0.0',
		})
		const requirement = requireCapability(
			graphqlHttpEndpointCapability,
			'^1.0.0',
		)
		const seen: GraphqlHttpEndpoint[] = []
		const consumer = plugin({
			contributions: [
				requirement,
				contributeApplication(({ capabilities }) => {
					seen.push(capabilities.get(requirement))
					return {}
				}),
			],
			core: '^0.0.0',
			id: 'fixture.graphql-http-consumer',
			version: '1.0.0',
		})
		const ultimabase = new (UltimaBase.use(provider, consumer))({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		onTestFinished(() => ultimabase.dispose())

		await ultimabase.start()

		// The reference handed consumers `{ path: '/</script>' }`.
		expect(seen).toStrictEqual([{ path: '/ok' }])
		expect(reads).toStrictEqual(['/ok'])
		expect(Object.isFrozen(seen[0])).toBe(true)
	})
})
