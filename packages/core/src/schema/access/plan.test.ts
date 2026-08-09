import { describe, expect, it, vi } from 'vitest'

import { createApplication } from '../../application/framework-application.js'
import { definePlugin } from '../../plugins/definition.js'
import { Schema, type FieldBuilder } from '../index.js'
import {
	compileApplicationAccessPlan,
	getApplicationAccessPlan,
} from './plan.js'

const oneRead = vi.fn(() => true)
const manyRead = vi.fn(() => true)
const countRead = vi.fn(() => false)
const existsRead = vi.fn(() => true)
const developerUpdate = vi.fn(() => true)
const developerFilter = vi.fn(() => ({ published: { eq: true } }) as const)
const developerItem = vi.fn(() => true)
const fieldItem = vi.fn(() => true)
const fieldFilter = vi.fn(() => false)
const fieldOrder = vi.fn(() => false)

const articleFields = (field: FieldBuilder) => ({
	published: field.boolean(),
	secret: field.string({
		access: {
			read: {
				orderBy: fieldOrder,
				output: fieldItem,
				where: fieldFilter,
			},
			write: { clear: true, fill: false, replace: true },
		},
	}),
	title: field.string({ validation: { required: true } }),
})

const articleSchema = Schema.define({
	className: 'CompiledAccessArticle',
	fields: articleFields,
	access: {
		read: {
			allow: {
				count: countRead,
				exists: existsRead,
				many: manyRead,
				one: oneRead,
			},
			where: developerFilter,
		},
		update: {
			allow: developerUpdate,
			item: developerItem,
		},
	},
})

describe('compiled Access plans', () => {
	it('normalizes grouped native rules without invoking callbacks', async () => {
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [],
		})
		const plan = getApplicationAccessPlan(application)
		const schemaPlan = plan.getSchema(articleSchema)
		const fieldPlan = plan.getField(articleSchema, ['secret'])

		expect(schemaPlan?.operation.get[0]?.rule).toBe(oneRead)
		expect(schemaPlan?.operation['find-one'][0]?.rule).toBe(oneRead)
		expect(schemaPlan?.operation['find-many'][0]?.rule).toBe(manyRead)
		expect(schemaPlan?.operation.count[0]?.rule).toBe(countRead)
		expect(schemaPlan?.operation.exists[0]?.rule).toBe(existsRead)
		expect(schemaPlan?.operation['update-one'][0]?.rule).toBe(developerUpdate)
		expect(schemaPlan?.operation['update-many'][0]?.rule).toBe(developerUpdate)
		expect(schemaPlan?.filter.read[0]?.rule).toBe(developerFilter)
		expect(schemaPlan?.item.update[0]?.rule).toBe(developerItem)
		expect(fieldPlan?.read.item[0]?.rule).toBe(fieldItem)
		expect(fieldPlan?.read.filter[0]?.rule).toBe(fieldFilter)
		expect(fieldPlan?.read.order[0]?.rule).toBe(fieldOrder)
		expect(fieldPlan?.write.clear[0]?.rule).toBe(true)
		expect(fieldPlan?.write.fill[0]?.rule).toBe(false)
		expect(fieldPlan?.write.replace[0]?.rule).toBe(true)
		expect(fieldPlan?.relationWrite).toStrictEqual([])
		expect(oneRead).not.toHaveBeenCalled()
		expect(developerFilter).not.toHaveBeenCalled()
		expect(fieldItem).not.toHaveBeenCalled()
		expect(Object.isFrozen(plan)).toBe(true)
		expect(Object.isFrozen(plan.schemas)).toBe(true)
		expect(Object.isFrozen(schemaPlan?.operation)).toBe(true)
		expect(Object.isFrozen(schemaPlan?.operation.get)).toBe(true)
		expect(Object.isFrozen(fieldPlan)).toBe(true)
		expect(compileApplicationAccessPlan(application)).toBe(plan)
	})

	it('preserves dependency-first plugin order before developer declarations', async () => {
		const firstRule = vi.fn(() => true)
		const secondRule = vi.fn(() => true)
		const first = definePlugin({
			name: 'fixture.access-first',
			setup: ({ access }) => {
				access.schema(
					'first',
					articleSchema,
					{ update: firstRule },
					{ master: 'bypass' },
				)
			},
		})
		const second = definePlugin({
			name: 'fixture.access-second',
			dependencies: ['fixture.access-first'],
			setup: ({ access }) => {
				access.schema(
					'second',
					articleSchema,
					{ update: secondRule },
					{ master: 'enforce' },
				)
			},
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [second, first],
		})
		const rules =
			getApplicationAccessPlan(application).getSchema(articleSchema)?.operation[
				'update-one'
			]

		expect(rules?.map(({ rule }) => rule)).toStrictEqual([
			firstRule,
			secondRule,
			developerUpdate,
		])
		expect(rules?.map(({ source }) => source)).toStrictEqual([
			{
				kind: 'plugin',
				localName: 'first',
				master: 'bypass',
				ownerPlugin: 'fixture.access-first',
				targetKind: 'schema',
			},
			{
				kind: 'plugin',
				localName: 'second',
				master: 'enforce',
				ownerPlugin: 'fixture.access-second',
				targetKind: 'schema',
			},
			{ kind: 'developer', master: 'enforce' },
		])
		expect(firstRule).not.toHaveBeenCalled()
		expect(secondRule).not.toHaveBeenCalled()
	})

	it('retains field target paths and exact identity lookup', async () => {
		const pluginFieldRule = vi.fn(() => false)
		const plugin = definePlugin({
			name: 'fixture.access-field',
			setup: ({ access }) => {
				access.field(
					'secret-field',
					articleSchema,
					['secret'],
					{
						read: {
							orderBy: pluginFieldRule,
							output: pluginFieldRule,
							where: pluginFieldRule,
						},
					},
					{ master: 'enforce' },
				)
			},
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})
		const plan = getApplicationAccessPlan(application)
		const fieldPlan = plan.getField(articleSchema, ['secret'])

		expect(fieldPlan?.read.item.map(({ rule }) => rule)).toStrictEqual([
			pluginFieldRule,
			fieldItem,
		])
		expect(fieldPlan?.read.filter.map(({ rule }) => rule)).toStrictEqual([
			pluginFieldRule,
			fieldFilter,
		])
		expect(fieldPlan?.read.order.map(({ rule }) => rule)).toStrictEqual([
			pluginFieldRule,
			fieldOrder,
		])
		const secretField = articleSchema.fields.secret

		expect(plan.getFields(articleSchema, secretField)).toStrictEqual([
			fieldPlan,
		])
		expect(plan.getField(articleSchema, ['missing'])).toBeUndefined()
	})

	it('keeps global defaults explicit and plans isolated per application', async () => {
		const [allowed, denied, split] = await Promise.all([
			createApplication({ schemas: [articleSchema], plugins: [] }),
			createApplication({
				access: { default: false },
				schemas: [articleSchema],
				plugins: [],
			}),
			createApplication({
				access: { default: { field: true, operation: false } },
				schemas: [articleSchema],
				plugins: [],
			}),
		])
		const allowedPlan = getApplicationAccessPlan(allowed)
		const deniedPlan = getApplicationAccessPlan(denied)
		const splitPlan = getApplicationAccessPlan(split)

		expect(allowedPlan.defaults).toStrictEqual({ field: true, operation: true })
		expect(deniedPlan.defaults).toStrictEqual({
			field: false,
			operation: false,
		})
		expect(splitPlan.defaults).toStrictEqual({
			field: true,
			operation: false,
		})
		expect(allowedPlan).not.toBe(deniedPlan)
		expect(deniedPlan).not.toBe(splitPlan)
		expect(Object.isFrozen(splitPlan.defaults)).toBe(true)
		expect(() => getApplicationAccessPlan({})).toThrow(
			new TypeError('Application Access plan is not compiled'),
		)
	})
})
