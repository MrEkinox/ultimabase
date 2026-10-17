import { stringField, UltimaBase } from '@ultimabase/core'
import { contributeDeclarations, plugin } from '@ultimabase/core/plugin'
import { describe, expect, it } from 'vitest'

import { patchSchemas, schemaPatch } from './schema-patch.js'

describe('patchSchemas static options', () => {
	it('records a detached copy of the static options in the patch provenance', () => {
		const staticOptions = { reason: 'audit' }
		const bindings: unknown[] = []
		const auditPlugin = plugin({
			core: '^0.0.0',
			id: 'fixture.static-options',
			version: '1.0.0',
			permissions: { 'schema:declare': 'Adds the audited field.' },
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						const binding = patchSchemas({
							patch: schemaPatch().addField({
								contributionId: 'audited',
								field: stringField(),
								name: 'audited',
							}),
							staticOptions,
							targets: schemas.select({ className: 'StaticOptionsTarget' }),
						})
						bindings.push(binding)
						return schemas.patch(binding)
					},
				}),
			],
		})
		const App = UltimaBase.use(auditPlugin)
		const Target = App.Schema.define({
			className: 'StaticOptionsTarget',
			fields: (field) => ({ title: field.string() }),
		})
		const compiled = new App({ logger: false, schemas: [Target] }).compile()
		staticOptions.reason = 'changed'

		expect(bindings[0]).toMatchObject({ staticOptions: { reason: 'audit' } })
		expect(
			Object.isFrozen(Reflect.get(Object(bindings[0]), 'staticOptions')),
		).toBe(true)
		expect(
			compiled.schemas.get(Target.className)?.provenance.fields.audited,
		).toMatchObject({
			contributionId: 'audited',
			normalizedStaticOptions: { reason: 'audit' },
		})
	})
})
