import { describe, expect, it } from 'vitest'

import { requestPrincipalResolverCapability } from '../access/subject/contracts.js'
import { FrameworkApplication } from '../application/framework-application.js'
import { FrameworkError } from '../errors/framework-error.js'
import { databaseAdapterCapability } from '../runtime/database/contracts.js'
import { requireCapability } from './capabilities.js'
import { defineCapability } from './capability-token.js'
import { plugin as createPlugin } from './plugin.js'

interface MissingCapabilityError {
	readonly code: unknown
	readonly internalDetails: unknown
	readonly message: string
}

const missing = (hint?: string): MissingCapabilityError => {
	const token = defineCapability<string>()({
		capabilityId: 'fixture.hinted',
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'application',
		compose: ([value]) => value,
		...(hint === undefined ? {} : { hint }),
	})
	const consumer = createPlugin({
		core: '^0.0.0',
		id: 'fixture.hint-consumer',
		version: '1.0.0',
		contributions: [requireCapability(token, '^1.0.0')],
	})
	try {
		new FrameworkApplication({
			logger: false,
			plugins: [consumer],
			schemas: [],
		})
	} catch (error: unknown) {
		if (error instanceof FrameworkError) {
			return {
				code: error.code,
				internalDetails: error.internalDetails,
				message: error.message,
			}
		}
		throw error
	}
	throw new TypeError('Expected PLUGIN_CAPABILITY_MISSING')
}

// ADR-0313 decision 4: the owner's one-line hint tells what to install.
describe('capability hints', () => {
	it('appends the hint to the message and to internalDetails', () => {
		const error = missing(
			'Install @fixture/provider and add providerPlugin() to UltimaBase.use(...).',
		)

		expect(error.code).toBe('PLUGIN_CAPABILITY_MISSING')
		expect(error.message).toBe(
			'Plugin "fixture.hint-consumer" requires capability "fixture.hinted" version "^1.0.0", but no compatible provider is installed. Install @fixture/provider and add providerPlugin() to UltimaBase.use(...).',
		)
		expect(error.internalDetails).toMatchObject({
			hint: 'Install @fixture/provider and add providerPlugin() to UltimaBase.use(...).',
		})
	})

	it('keeps the message unchanged without a hint', () => {
		const error = missing()

		expect(error.message).toBe(
			'Plugin "fixture.hint-consumer" requires capability "fixture.hinted" version "^1.0.0", but no compatible provider is installed.',
		)
		expect(error.internalDetails).not.toHaveProperty('hint')
	})

	it.each<readonly [unknown, string]>([
		['', 'empty'],
		['   ', 'blank'],
		['first line\nsecond line', 'multi-line'],
		['x'.repeat(201), 'too long'],
		[42, 'not a string'],
	])('rejects an invalid hint (%#: %s)', (hint) => {
		expect(() =>
			defineCapability<string>()({
				capabilityId: 'fixture.invalid-hint',
				version: '1.0.0',
				cardinality: 'single',
				lifetime: 'application',
				compose: ([value]) => value,
				hint: hint as never,
			}),
		).toThrow(
			'capability hint must be one non-empty line of at most 200 characters',
		)
	})

	it('accepts a hint of exactly 200 characters', () => {
		expect(
			defineCapability<string>()({
				capabilityId: 'fixture.long-hint',
				version: '1.0.0',
				cardinality: 'single',
				lifetime: 'application',
				compose: ([value]) => value,
				hint: 'x'.repeat(200),
			}).hint,
		).toHaveLength(200)
	})

	it('gives Core-owned tokens neutral hints that name no plugin package', () => {
		for (const token of [
			databaseAdapterCapability,
			requestPrincipalResolverCapability,
		]) {
			expect(token.hint).toEqual(expect.any(String))
			expect(token.hint).not.toMatch(/@ultimabase\/|-plugin\b|[a-z]+Plugin\(/u)
		}
	})
})
