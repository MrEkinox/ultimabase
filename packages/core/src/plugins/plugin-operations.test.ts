import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	defineOperation,
	defineOperationValue,
	isPluginOperationDefinition,
} from './plugin-operations.js'

const passthrough = defineOperationValue((value) => value)

describe('plugin operation declarations', () => {
	it('creates one frozen namespaced versioned token without execution state', () => {
		const operation = defineOperation({
			input: passthrough,
			name: 'community.workflow.publish',
			result: passthrough,
			target: 'schema',
			transaction: 'required',
			version: '1.2.3',
		})

		expect(operation).toStrictEqual({
			input: passthrough,
			kind: 'plugin-operation',
			name: 'community.workflow.publish',
			result: passthrough,
			target: 'schema',
			transaction: 'required',
			version: '1.2.3',
		})
		expect(Object.isFrozen(operation)).toBe(true)
		expect(isPluginOperationDefinition(operation)).toBe(true)
		expect(isPluginOperationDefinition({ ...operation })).toBe(false)
		expect(operation).not.toHaveProperty('execute')
		expect(operation).not.toHaveProperty('transport')
		expect(operation).not.toHaveProperty('serialize')
	})

	it('rejects ambiguous identities and malformed envelope metadata', () => {
		const base = {
			input: passthrough,
			name: 'community.workflow.publish',
			result: passthrough,
			target: 'schema' as const,
			transaction: 'required' as const,
			version: '1.0.0',
		}

		expect(() => defineOperation({ ...base, name: 'publish' })).toThrow(
			'operation name must be namespaced',
		)
		expect(() => defineOperation({ ...base, version: '^1.0.0' })).toThrow(
			'operation version must be exact SemVer',
		)
		expect(() =>
			defineOperation({ ...base, transaction: 'sometimes' as never }),
		).toThrow('operation transaction must be forbidden, optional, or required')
		expect(() =>
			defineOperation({ ...base, target: 'database' as never }),
		).toThrow('operation target must be application, schema, or model')
		expect(() =>
			defineOperation({ ...base, execute: () => undefined } as never),
		).toThrow('operation definition contains unknown option: execute')
	})

	it('requires explicit value snapshot contracts', () => {
		expect(() => defineOperationValue(undefined as never)).toThrow(
			'operation value snapshot must be a function',
		)
		expect(() =>
			defineOperation({
				input: immutableRecord({
					snapshot: (value: unknown) => value,
					extra: true,
				}),
				name: 'community.workflow.invalid-input',
				result: passthrough,
				target: 'application',
				transaction: 'forbidden',
				version: '1.0.0',
			} as never),
		).toThrow('operation input contains unknown option: extra')
	})
})
