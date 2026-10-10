import { afterEach, describe, expect, it, vi } from 'vitest'

import {
	deriveEnvironmentDefault,
	describeEnvironmentSource,
	readDeploymentEnvironment,
} from './deployment-environment.js'

afterEach(() => {
	vi.unstubAllEnvs()
})

const defaults = { development: 'override', production: 'fail' } as const

// ADR-0312: one rule for every official plugin default.
describe('deployment environment', () => {
	it('treats production as production and anything else as development', () => {
		vi.stubEnv('NODE_ENV', 'production')
		expect(readDeploymentEnvironment()).toBe('production')
		for (const value of ['development', 'test', 'staging', 'Production', '']) {
			vi.stubEnv('NODE_ENV', value)
			expect(readDeploymentEnvironment()).toBe('development')
		}
		vi.stubEnv('NODE_ENV', undefined)
		expect(readDeploymentEnvironment()).toBe('development')
	})

	it('derives the default of the current environment and names its source', () => {
		vi.stubEnv('NODE_ENV', 'production')
		expect(deriveEnvironmentDefault(undefined, defaults)).toStrictEqual({
			source: 'production',
			value: 'fail',
		})
		vi.stubEnv('NODE_ENV', undefined)
		expect(deriveEnvironmentDefault(undefined, defaults)).toStrictEqual({
			source: 'development',
			value: 'override',
		})
	})

	it('lets an explicit value win in every environment', () => {
		for (const environment of ['production', 'development', undefined]) {
			vi.stubEnv('NODE_ENV', environment)
			expect(deriveEnvironmentDefault('ignore', defaults)).toStrictEqual({
				source: 'option',
				value: 'ignore',
			})
			expect(
				deriveEnvironmentDefault(false, {
					development: true,
					production: true,
				}),
			).toStrictEqual({
				source: 'option',
				value: false,
			})
		}
	})

	it('describes each source for log lines', () => {
		expect(describeEnvironmentSource('option')).toBe('explicit option')
		expect(describeEnvironmentSource('production')).toBe(
			'NODE_ENV is production',
		)
		expect(describeEnvironmentSource('development')).toBe(
			'NODE_ENV is not production',
		)
	})
})
