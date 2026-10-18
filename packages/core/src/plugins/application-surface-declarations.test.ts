import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	createApplicationSurfaceRegistrars,
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

describe('application surface declaration validation', () => {
	it('rejects malformed mutation surfaces and retired command maps', () => {
		const declarations: MutableApplicationSurfaceDeclarations = {
			modelSurfaces: [],
			operations: [],
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
		for (const removedKey of ['modelCommands', 'schemaCommands']) {
			expect(() => {
				registrars.models.extend(
					{},
					{
						contributionId: 'retired-map',
						[removedKey]: { inspect: operation },
					},
				)
			}).toThrow(`model surface contains unknown option: ${removedKey}`)
		}
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
	})

	it('refuses an alias that does not name its operation (ADR-0347)', () => {
		const registrars = createApplicationSurfaceRegistrars(
			immutableRecord({
				kind: 'plugin' as const,
				pluginId: 'fixture.surface-names',
				version: '1.0.0',
			}),
			{ modelSurfaces: [], operations: [] },
			() => {
				throw new TypeError('selection must not be reached')
			},
		)
		const many = defineSchemaMutation({
			authority: 'request',
			effect: 'update',
			input: value,
			name: 'fixture.surface.mutation-many',
			returning: 'after',
			target: 'many',
			version: '1.0.0',
		})
		const extend = (name: string, target: typeof mutation | typeof many) => {
			registrars.models.extend(
				{},
				{
					contributionId: `named-${name}`,
					schemaMutations: {
						[name]: { mutation: target, surfaces: ['schema'] },
					},
				},
			)
		}

		expect(() => {
			extend('archive', mutation)
		}).toThrow(
			'Command archive must be named <operation>One because its target is one: archiveOne',
		)
		expect(() => {
			extend('archiveOne', many)
		}).toThrow(
			'Command archiveOne must be named <operation>Many because its target is many: archiveMany',
		)
		expect(() => {
			extend('updateOne', mutation)
		}).toThrow(
			'Command updateOne names the operation update, which Core reserves',
		)
	})
})
