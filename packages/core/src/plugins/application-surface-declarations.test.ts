import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	createApplicationSurfaceRegistrars,
	defineQueryExtension,
	type MutableApplicationSurfaceDeclarations,
} from './application-surface-declarations.js'
import { defineOperation, defineOperationValue } from './plugin-operations.js'
import { defineSchemaMutation } from './plugin-schema-mutations.js'

const value = defineOperationValue((input) => input)
const operation = defineOperation({
	input: value,
	name: 'fixture.surface.invalid-declaration',
	result: value,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const mutation = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: value,
	name: 'fixture.surface.mutation',
	returning: 'after',
	version: '1.0.0',
})

const queryOptions = {
	apply: () => {
		throw new TypeError('not reached')
	},
	input: value,
	name: 'fixture.surface.query',
	version: '1.0.0',
}

describe('application surface declaration validation', () => {
	it('rejects malformed query extension descriptors', () => {
		expect(() => defineQueryExtension(undefined as never)).toThrow(
			'query extension must be a plain object',
		)
		expect(() =>
			defineQueryExtension({ ...queryOptions, execute: true } as never),
		).toThrow('query extension contains unknown option: execute')
		expect(() =>
			defineQueryExtension({ ...queryOptions, name: 'query' }),
		).toThrow('query extension name must be namespaced')
		expect(() =>
			defineQueryExtension({ ...queryOptions, version: '^1.0.0' }),
		).toThrow('query extension version must be exact SemVer')
		expect(() =>
			defineQueryExtension({ ...queryOptions, input: {} } as never),
		).toThrow('query extension input must expose a snapshot function')
		expect(() =>
			defineQueryExtension({ ...queryOptions, apply: undefined } as never),
		).toThrow('query extension apply must be a function')
	})

	it('rejects malformed command and query surface contributions', () => {
		const declarations: MutableApplicationSurfaceDeclarations = {
			modelSurfaces: [],
			operations: [],
			querySurfaces: [],
		}
		const registrars = createApplicationSurfaceRegistrars(
			immutableRecord({
				kind: 'plugin' as const,
				pluginId: 'fixture.surface-validation',
				version: '1.0.0',
			}),
			declarations,
			() => {
				throw new TypeError('selection must not be reached')
			},
		)

		expect(() => {
			registrars.models.extend({}, undefined as never)
		}).toThrow('model surface must be a plain object')
		expect(() => {
			registrars.models.extend(
				{},
				{ contributionId: 'empty', modelCommands: {} },
			)
		}).toThrow('model surface must declare at least one command')
		expect(() => {
			registrars.models.extend({}, {
				contributionId: 'wrong-target',
				modelCommands: { inspect: operation },
			} as never)
		}).toThrow('model surface.inspect must reference a model operation')
		expect(() => {
			registrars.operations.declare({} as never)
		}).toThrow(
			'operation must be created by defineOperation or defineSchemaMutation',
		)
		expect(() => {
			registrars.models.extend(
				{},
				{
					contributionId: 'invalid-mutation-name',
					schemaMutations: {
						'not-safe': { mutation, surfaces: ['schema'] },
					},
				},
			)
		}).toThrow('must be a TypeScript and GraphQL identifier')
		expect(() => {
			registrars.models.extend(
				{},
				{
					contributionId: 'empty-mutation-surfaces',
					schemaMutations: { archive: { mutation, surfaces: [] } },
				},
			)
		}).toThrow('surfaces must be a non-empty array')
		expect(() => {
			registrars.models.extend(
				{},
				{
					contributionId: 'forged-mutation',
					schemaMutations: {
						archive: { mutation: {} as never, surfaces: ['schema'] },
					},
				},
			)
		}).toThrow('must be created by defineSchemaMutation')
		expect(() => {
			registrars.queries.extend({}, undefined as never)
		}).toThrow('query surface must be a plain object')
		expect(() => {
			registrars.queries.extend(
				{},
				{ contributionId: 'invalid-map', extensions: undefined as never },
			)
		}).toThrow('query surface extensions must be a plain object')
		expect(() => {
			registrars.queries.extend(
				{},
				{ contributionId: 'forged', extensions: { forged: {} as never } },
			)
		}).toThrow('query surface forged must be created by defineQueryExtension')
		expect(() => {
			registrars.queries.extend({}, { contributionId: 'empty', extensions: {} })
		}).toThrow('query surface must declare at least one extension')
	})
})
