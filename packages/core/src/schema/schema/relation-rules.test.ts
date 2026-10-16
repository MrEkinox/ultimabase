import { describe, expect, it } from 'vitest'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { createApplication } from '../../application/framework-application.js'
import { plugin as createPlugin } from '../../plugin.js'
import { runWithRequestEngine } from '../../runtime/context/active-framework-context.js'
import { requestSources } from '../../runtime/context/request-context.js'
import { createFrameworkEngine } from '../../runtime/application/create-framework-engine.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { getRelationWhereDeclaration } from '../fields/base/definition.js'
import { relationField } from '../fields/builtins/relation.js'

const databasePlugin = (adapter: RecordingDatabaseAdapter) =>
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.relation-rules-database',
		version: '0.0.0',
		contributions: [provideTestDatabaseAdapter(adapter)],
	})

describe('relation rules of .with() (ADR-0328)', () => {
	it('applies filters that two schemas declare on each other', async () => {
		const Author = UltimaBase.Schema.define({
			className: 'RuleAuthor',
			fields: (field) => ({
				articles: field.relation({
					mappedBy: 'author',
					target: () => Article,
				}),
				listed: field.boolean(),
			}),
		}).with({ relations: { articles: { where: { published: { eq: true } } } } })
		const Article = UltimaBase.Schema.define({
			className: 'RuleArticle',
			fields: (field) => ({
				author: field.pointer({ target: () => Author }),
				contributors: field.relation({ target: () => Author }),
				published: field.boolean(),
			}),
		}).with({
			relations: {
				contributors: { where: ({ where }) => where.eq('listed', true) },
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[
				{ status: 'fulfilled', value: [] },
				{ status: 'fulfilled', value: [] },
			],
			[],
		)
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Author, Article],
		})
		const request = createFrameworkEngine(application).anonymous({
			requestId: 'relation-rules',
			source: requestSources.internal,
		})

		try {
			await runWithRequestEngine(request, async () => {
				await Author.findMany({ include: { articles: {} } } as never)
				await Article.findMany({ include: { contributors: {} } } as never)
			})
			expect(
				adapter.rootRequests[0]?.inclusions?.[0]?.request.rowFilter,
			).toMatchObject({ field: 'published', kind: 'equal', value: true })
			expect(
				adapter.rootRequests[1]?.inclusions?.[0]?.request.rowFilter,
			).toMatchObject({ field: 'listed', kind: 'equal', value: true })
		} finally {
			await application.dispose()
		}
	})

	it('accepts empty rules and a relation built by relationField', () => {
		const Target = UltimaBase.Schema.define({
			className: 'RuleBuiltTarget',
			fields: (field) => ({ visible: field.boolean() }),
		})
		const declare = (relations: unknown) =>
			UltimaBase.Schema.define({
				className: 'RuleBuiltSource',
				fields: () => ({ targets: relationField({ target: () => Target }) }),
			}).with({ relations: relations as never })

		const empty = declare({ targets: {} }).persistedFields.targets
		const filtered = declare({ targets: { where: { visible: { eq: true } } } })
			.persistedFields.targets

		expect(empty && getRelationWhereDeclaration(empty)).toBeUndefined()
		expect(filtered && getRelationWhereDeclaration(filtered)).toStrictEqual({
			input: { visible: { eq: true } },
			kind: 'static',
		})
	})

	it('rejects rules that do not filter one relation field at declaration', () => {
		const declare = () =>
			UltimaBase.Schema.define({
				className: 'RuleSource',
				fields: (field) => ({
					label: field.string(),
					targets: field.relation({ target: 'RuleSource' }),
				}),
			})
		const withRules = (relations: unknown) => () =>
			declare().with({ relations: relations as never })

		expect(withRules({ missing: { where: {} } })).toThrow(
			'relations.missing must name a relation field of this schema',
		)
		expect(withRules({ label: { where: {} } })).toThrow(
			'relations.label must name a relation field of this schema',
		)
		expect(withRules({ targets: { include: {} } })).toThrow(
			'Unknown relation rule: relations.targets.include',
		)
		expect(withRules([])).toThrow('relations must be a plain object')
		expect(withRules({ targets: true })).toThrow(
			'relations.targets must be a plain object',
		)
		expect(withRules({ targets: { where: null } })).toThrow(
			'relations.targets.where must be a plain object or synchronous resolver',
		)
		expect(withRules({ targets: { where: [] } })).toThrow(
			'relations.targets.where must be a plain object or synchronous resolver',
		)
		expect(
			withRules({
				targets: {
					where: async () => {
						await Promise.resolve()
						return {}
					},
				},
			}),
		).toThrow('relations.targets.where resolver must be synchronous')
		expect(withRules({ targets: { where: {} } })).not.toThrow()
	})

	it('points a field-level where to plugins.relations(...)', () => {
		expect(() =>
			UltimaBase.Schema.define({
				className: 'RuleFieldWhere',
				fields: (field) => ({
					targets: field.relation({
						target: 'RuleFieldWhere',
						where: {},
					} as never),
				}),
			}),
		).toThrow(
			'RuleFieldWhere.fields.targets cannot declare where: declare relation filters in .with((plugins) => plugins.relations({ targets: { where } }))',
		)
	})
})
