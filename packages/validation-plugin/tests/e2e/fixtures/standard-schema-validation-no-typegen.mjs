import {
	databaseAdapterCapability,
	plugin,
	provideCapability,
	UltimaBase,
} from '@ultimabase/core'
import { validationPlugin } from '@ultimabase/validation-plugin'
import process from 'node:process'
import * as v from 'valibot'
import { z } from 'zod'

const fixtures = [
	{
		name: 'Zod',
		validator: z.string().min(2, 'JavaScript validator rejected the title'),
	},
	{
		name: 'Valibot',
		validator: v.pipe(
			v.string(),
			v.minLength(2, 'JavaScript validator rejected the title'),
		),
	},
]

const results = []

const unsupported = () => {
	throw new TypeError('Validation must reject before database execution')
}

const databasePlugin = plugin({
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'javascript-validation-database',
			create: () => ({
				value: {
					beginTransaction: async () => ({
						capabilities: {},
						commit: () => Promise.resolve(),
						execute: unsupported,
						kind: 'database-transaction-adapter',
						prepare: unsupported,
						rollback: () => Promise.resolve(),
					}),
					capabilities: {},
					execute: unsupported,
					kind: 'database-adapter',
				},
			}),
		}),
	],
	core: '^0.0.0',
	id: 'fixture.javascript-validation-database',
	version: '1.0.0',
})

const Application = UltimaBase.use(validationPlugin()).use(databasePlugin)

for (const fixture of fixtures) {
	const Note = Application.Schema.define({
		className: `JavaScriptValidation${fixture.name}`,
		fields: (field) => ({
			title: field.string({
				required: true,
				validation: fixture.validator,
			}),
		}),
	})
	const ultimabase = new Application({
		logger: false,
		schemas: [Note],
	})

	try {
		await ultimabase.start()
		await Note.createOne({ data: { title: 'x' } })
		throw new Error(`${fixture.name} unexpectedly accepted invalid input`)
	} catch (error) {
		if (error?.code !== 'VALIDATION_ERROR') {
			throw error
		}

		const issue = error.publicDetails?.issues?.[0]

		results.push({
			code: issue?.code,
			message: issue?.message,
			name: fixture.name,
			path: issue?.path,
		})
	} finally {
		await ultimabase.dispose()
	}
}

process.stdout.write(`${JSON.stringify(results)}\n`)
