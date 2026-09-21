import {
	Schema,
	SchemaRegistry,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	fieldHooks,
	globalHooks,
	schemaHooks,
	type HookContributionDefinition,
	type OwnedHookContribution,
} from '../contributions.js'
import { compileHookContributionPlan } from './contribution-plan.js'

const registryFor = (...schemas: readonly SchemaDefinition[]) =>
	new SchemaRegistry(schemas)

const requireField = (field: GenericField | undefined): GenericField => {
	if (field === undefined) throw new TypeError('Expected fixture field')
	return field
}

const owned = (
	contributionId: string,
	definition: HookContributionDefinition,
	instanceId?: string,
): OwnedHookContribution => ({
	contributionId,
	definition,
	owner: {
		pluginId: 'fixture.lifecycle',
		...(instanceId === undefined ? {} : { instanceId }),
	},
	pluginVersion: '1.0.0',
})

const Article = Schema.define({
	className: 'HookContributionSecurityBoundary',
	fields: (field) => ({ title: field.string() }),
})
const articleTitle = requireField(Article.fields.title)

describe('Hook contribution security plan', () => {
	it('preserves global, schema, and field ownership in reversible order', () => {
		const beforeGlobal = () => undefined
		const beforeSchema = () => undefined
		const resolveTitle = () => undefined
		const plan = compileHookContributionPlan(registryFor(Article), [
			owned(
				'global',
				globalHooks({ beforeOperation: { create: beforeGlobal } }),
			),
			owned(
				'schema',
				schemaHooks(Article, {
					beforeOperation: { create: beforeSchema },
				}),
				'worker',
			),
			owned(
				'field',
				fieldHooks(Article, articleTitle, ['title'], {
					resolveInput: resolveTitle,
				}),
			),
		])

		const schemaPlan = plan.getSchema(Article)
		const fieldPlan = plan.getField(Article, ['title'])

		expect(
			schemaPlan?.contributions.before.map((contribution) =>
				contribution.kind === 'plugin'
					? contribution.localName
					: contribution.kind,
			),
		).toStrictEqual(['global', 'schema'])
		expect(
			schemaPlan?.contributions.after.map((contribution) =>
				contribution.kind === 'plugin'
					? contribution.localName
					: contribution.kind,
			),
		).toStrictEqual(['schema', 'global'])
		expect(schemaPlan?.contributions.before[1]).toMatchObject({
			localName: 'schema',
			ownerInstanceId: 'worker',
			ownerPlugin: 'fixture.lifecycle',
			targetKind: 'schema',
		})
		expect(fieldPlan?.contributions.before[0]).toMatchObject({
			localName: 'field',
			targetKind: 'field',
		})
		expect(fieldPlan?.path).toStrictEqual(['title'])
		expect(Object.isFrozen(fieldPlan)).toBe(true)
		expect(Object.isFrozen(plan.schemas)).toBe(true)
	})

	it('rejects empty declarations and exact targets outside the application', () => {
		const Outside = Schema.define({
			className: 'HookContributionOutside',
			fields: (field) => ({ title: field.string() }),
		})
		const outsideTitle = requireField(Outside.fields.title)

		for (const create of [
			() => globalHooks({}),
			() => schemaHooks(Article, {}),
			() => fieldHooks(Article, articleTitle, ['title'], {}),
		]) {
			expect(create).toThrow('must declare at least one Hook handler')
		}

		expect(() =>
			compileHookContributionPlan(registryFor(Article), [
				owned(
					'outside-schema',
					schemaHooks(Outside, {
						beforeOperation: { create: () => undefined },
					}),
				),
			]),
		).toThrow('targets a schema outside its application')

		expect(() =>
			compileHookContributionPlan(registryFor(Article), [
				owned(
					'inconsistent-field',
					fieldHooks(Article, outsideTitle, ['title'], {
						resolveInput: () => undefined,
					}),
				),
			]),
		).toThrow('resolved an inconsistent field target')
	})

	it('keeps absent schema and field lookups application-local', () => {
		const Outside = Schema.define({
			className: 'HookContributionAbsentLookup',
			fields: (field) => ({ title: field.string() }),
		})
		const plan = compileHookContributionPlan(registryFor(Article), [])

		expect(plan.getSchema(Outside)).toBeUndefined()
		expect(plan.getField(Outside, ['title'])).toBeUndefined()
	})
})
