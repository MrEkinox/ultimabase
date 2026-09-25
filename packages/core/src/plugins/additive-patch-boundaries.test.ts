import { describe, expect, it } from 'vitest'

import { optionPlugin } from '../../tests/plugins/schema-declarations.fixtures.js'
import {
	FrameworkApplication,
	Schema,
	plugin as createPlugin,
	contributeDeclarations,
	setSchemaFieldOption,
	setSchemaOption,
} from '../index.js'

describe('additive option patch boundaries', () => {
	it.each(['schema', 'field'] as const)(
		'rejects duplicate %s option values atomically',
		(scope) => {
			const Post = Schema.define({
				className: `DuplicateOption${scope}`,
				fields: (field) => ({ title: field.string() }),
			})
			const patcher = createPlugin({
				core: '^0.0.0',
				id: 'fixture.duplicate-option-values',
				version: '1.0.0',
				permissions: { 'schema:declare': 'Exercises additive conflicts.' },
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.patch({
								targets: schemas.select({ className: Post.className }),
								operations: ['first', 'second'].map((contributionId) =>
									scope === 'schema'
										? setSchemaOption({
												contributionId,
												name: 'workflow',
												value: { enabled: true },
											})
										: setSchemaFieldOption({
												contributionId,
												field: 'title',
												name: 'search',
												value: { weight: 1 },
											}),
								),
							})

							return undefined
						},
					}),
				],
			})
			const application = new FrameworkApplication({
				pluginPrivileges: { logger: false },
				plugins: [optionPlugin(), patcher],
				schemas: [Post],
			})
			// Failed patches cannot publish their first value or overwrite an earlier one.
			expect(() => application.compileSchemas()).toThrow(
				`Duplicate ${scope} option`,
			)
			expect(application.schemas.values()).toEqual([Post])
			expect(Post.definition).not.toHaveProperty('workflow')
			expect(Post.fields.title?.options).not.toHaveProperty('search')
		},
	)

	it('rejects the removed replacement target for JavaScript callers', () => {
		expect(() =>
			setSchemaOption({
				contributionId: 'replace-schema-option',
				name: 'workflow',
				value: false,
				target: {},
			} as never),
		).toThrow('key: target')
		expect(() =>
			setSchemaFieldOption({
				contributionId: 'replace-field-option',
				field: 'title',
				name: 'search',
				value: false,
				target: {},
			} as never),
		).toThrow('key: target')
	})
})
