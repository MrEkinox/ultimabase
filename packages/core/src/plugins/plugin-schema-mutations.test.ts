import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { defineOperationValue } from './plugin-operations.js'
import {
	defineSchemaMutation,
	isPluginSchemaMutationDefinition,
} from './plugin-schema-mutations.js'

const input = defineOperationValue((value, path) => {
	if (typeof value !== 'string') throw new TypeError(`${path} must be a string`)
	return value
})

const options = {
	authority: 'request' as const,
	effect: 'update' as const,
	errors: ['fixture.workflow.rejected'] as const,
	input,
	name: 'fixture.workflow.archive',
	returning: 'after' as const,
	select: { workflowState: true } as const,
	version: '1.0.0',
}

describe('plugin schema mutation definitions', () => {
	it('creates an immutable nominal token with detached collections', () => {
		const definition = defineSchemaMutation(options)

		expect(isPluginSchemaMutationDefinition(definition)).toBe(true)
		expect(isPluginSchemaMutationDefinition({ ...definition })).toBe(false)
		expect(definition).toStrictEqual({
			...options,
			kind: 'plugin-schema-mutation',
		})
		expect(Object.isFrozen(definition)).toBe(true)
		expect(Object.isFrozen(definition.errors)).toBe(true)
		expect(Object.isFrozen(definition.select)).toBe(true)
	})

	it('rejects malformed identity, values, effects, authority, and dependencies', () => {
		expect(() => defineSchemaMutation(undefined as never)).toThrow(
			'schema mutation definition must be a plain object',
		)
		expect(() =>
			defineSchemaMutation({ ...options, execute: () => undefined } as never),
		).toThrow('schema mutation definition contains unknown option: execute')
		expect(() => defineSchemaMutation({ ...options, name: 'archive' })).toThrow(
			'schema mutation name must be namespaced',
		)
		expect(() =>
			defineSchemaMutation({ ...options, version: '^1.0.0' }),
		).toThrow('schema mutation version must be exact SemVer')
		expect(() =>
			defineSchemaMutation({ ...options, input: {} } as never),
		).toThrow('schema mutation input must expose a snapshot function')
		expect(() =>
			defineSchemaMutation({ ...options, authority: 'system' } as never),
		).toThrow('schema mutation authority must be request or master')
		expect(() =>
			defineSchemaMutation({ ...options, effect: 'create' } as never),
		).toThrow('schema mutation effect must be update or delete')
		expect(() =>
			defineSchemaMutation({ ...options, returning: 'none' } as never),
		).toThrow('schema mutation returning must be before or after')
		expect(() =>
			defineSchemaMutation({ ...options, select: [] } as never),
		).toThrow('schema mutation select must be a plain object')
		expect(() =>
			defineSchemaMutation({
				...options,
				select: { workflowState: false },
			} as never),
		).toThrow('schema mutation select.workflowState must be true')
		expect(() =>
			defineSchemaMutation({
				...options,
				errors: ['fixture.workflow.rejected', 'fixture.workflow.rejected'],
			}),
		).toThrow('schema mutation errors contains duplicate code')
	})

	it('restricts protocol-1 delete effects to trusted before-record mutations', () => {
		expect(() =>
			defineSchemaMutation({ ...options, effect: 'delete' }),
		).toThrow('delete schema mutations must require master authority')
		expect(() =>
			defineSchemaMutation({
				...options,
				authority: 'master',
				effect: 'delete',
			}),
		).toThrow('delete schema mutations must return the before record')

		const purge = defineSchemaMutation({
			...options,
			authority: 'master',
			effect: 'delete',
			name: 'fixture.workflow.purge',
			returning: 'before',
			select: immutableRecord({}),
		})
		expect(purge.authority).toBe('master')
	})
})
