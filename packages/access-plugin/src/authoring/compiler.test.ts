import {
	definePluginField,
	Schema,
	SchemaRegistry,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	fieldAccess,
	fieldKindAccess,
	globalAccess,
	schemaAccess,
	type AccessContributionDefinition,
	type OwnedAccessContribution,
} from '../contributions.js'
import { defineFieldKindAccessTarget } from '../targets.js'
import { compileAccessPlan } from './compiler.js'

const owner = { instanceId: 'primary', pluginId: 'fixture.security' } as const

const owned = (
	contributionId: string,
	definition: AccessContributionDefinition,
	pluginId: string = owner.pluginId,
): OwnedAccessContribution => ({
	contributionId,
	definition,
	owner: { instanceId: owner.instanceId, pluginId },
	pluginVersion: '1.0.0',
})

const defaults = { field: false, operation: false } as const

const secureText = definePluginField(
	'fixture.secure-text',
	{},
	{ snapshotValue: (value) => value },
)
const secureTextTarget = defineFieldKindAccessTarget(
	'fixture.secure-text' as never,
)

const Secured = Schema.define({
	className: 'CompiledAccessSecurityBoundary',
	fields: (field) => ({
		custom: secureText,
		title: field.string(),
	}),
})

const registryFor = (...schemas: readonly SchemaDefinition[]) =>
	new SchemaRegistry(schemas)

const requireField = (field: GenericField | undefined): GenericField => {
	if (field === undefined) throw new TypeError('Expected fixture field')
	return field
}

const securedTitle = requireField(Secured.fields.title)

describe('compileAccessPlan plugin contributions', () => {
	it('expands every target kind with exact ownership, order, and Master mode', () => {
		const seen: string[] = []
		const contributions = [
			owned('global', globalAccess({ read: true })),
			owned(
				'schema',
				schemaAccess(Secured, { read: true }, { master: 'bypass' }),
			),
			owned(
				'field',
				fieldAccess(Secured, securedTitle, ['title'], { read: false }),
			),
			owned(
				'field-kind',
				fieldKindAccess(secureTextTarget, ({ field, path, schema }) => {
					seen.push(`${schema.className}:${path.join('.')}:${field.kind}`)
					return { read: false }
				}),
			),
		]

		const plan = compileAccessPlan(
			registryFor(Secured),
			defaults,
			contributions,
		)
		const schemaPlan = plan.getSchema(Secured)
		const titlePlan = plan.getField(Secured, ['title'])
		const customPlan = plan.getField(Secured, ['custom'])

		expect(
			schemaPlan?.operation['find-many'].map(({ source }) => source),
		).toEqual([
			expect.objectContaining({ localName: 'global', targetKind: 'global' }),
			expect.objectContaining({
				localName: 'schema',
				master: 'bypass',
				ownerInstanceId: 'primary',
				targetKind: 'schema',
			}),
		])
		expect(titlePlan?.read.item).toHaveLength(1)
		expect(customPlan?.read.item[0]?.source).toMatchObject({
			localName: 'field-kind',
			targetKind: 'field-kind',
		})
		expect(plan.getFields(Secured, securedTitle)).toEqual([titlePlan])
		expect(plan.defaults).toBe(defaults)
		expect(seen).toStrictEqual([
			'CompiledAccessSecurityBoundary:custom:fixture.secure-text',
		])
	})

	it('rejects empty expanded declarations and unavailable exact targets', () => {
		const Outside = Schema.define({
			className: 'OutsideAccessSecurityBoundary',
			fields: (field) => ({ title: field.string() }),
		})
		const outsideTitle = requireField(Outside.fields.title)

		expect(() =>
			compileAccessPlan(registryFor(Secured), defaults, [
				owned(
					'empty-rules',
					fieldKindAccess(secureTextTarget, () => ({})),
				),
			]),
		).toThrow('must declare')

		expect(() =>
			compileAccessPlan(registryFor(Secured), defaults, [
				owned('outside-schema', schemaAccess(Outside, { read: true })),
			]),
		).toThrow('targets a schema outside its application')

		expect(() =>
			compileAccessPlan(registryFor(Secured), defaults, [
				owned(
					'inconsistent-field',
					fieldAccess(Secured, outsideTitle, ['title'], { read: true }),
				),
			]),
		).toThrow('targets an unavailable field')
	})

	it('returns empty immutable lookups for schemas and fields outside the plan', () => {
		const Outside = Schema.define({
			className: 'OutsideAccessLookup',
			fields: (field) => ({ title: field.string() }),
		})
		const outsideTitle = requireField(Outside.fields.title)
		const plan = compileAccessPlan(registryFor(Secured), defaults)

		expect(plan.getSchema(Outside)).toBeUndefined()
		expect(plan.getField(Outside, ['title'])).toBeUndefined()
		expect(plan.getFields(Outside, outsideTitle)).toStrictEqual([])
		expect(Object.isFrozen(plan.getFields(Outside, outsideTitle))).toBe(true)
	})
})
