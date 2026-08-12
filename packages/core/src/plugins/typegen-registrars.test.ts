import { describe, expect, it } from 'vitest'

import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import {
	defineTypegenReference,
	type TypegenOutputDeclarationOptions,
	type TypegenReference,
	type TypegenStructuredContribution,
} from './typegen-contracts.js'
import {
	createTypegenRegistrars,
	snapshotTypegenDeclarations,
	type MutableTypegenDeclarations,
} from './typegen-declarations.js'

const owner: PluginSchemaContributionOwner = {
	kind: 'plugin',
	pluginId: 'fixture.typegen',
	version: '1.2.3',
}

const createFixture = () => {
	const declarations: MutableTypegenDeclarations = {
		contributions: [],
		outputs: [],
		references: [],
	}
	const registrars = createTypegenRegistrars(owner, declarations, (): void => {
		// This fixture keeps its registration session open for the whole test.
	})
	return { declarations, registrars }
}

describe('owner-bound Typegen registrars', () => {
	it('captures schema and model augmentations plus both inert output kinds', () => {
		const { declarations, registrars } = createFixture()
		const reference = defineTypegenReference({
			exportName: 'WorkflowState',
			module: '@fixture/workflow',
		})
		registrars.references.register(reference)
		registrars.contributions.add({
			augmentations: [
				{
					model: [{ name: 'approve', type: { kind: 'boolean' } }],
					schema: [{ name: 'publish', type: { kind: 'reference', reference } }],
					target: 'Editorial',
				},
			],
			contributionId: 'workflow',
			declarations: [
				{
					description: 'Configured state.',
					kind: 'type',
					name: 'ConfiguredWorkflow',
					type: { kind: 'reference', reference },
				},
			],
		})
		registrars.outputs.emit({
			contributionId: 'declarations',
			declarations: [
				{
					kind: 'type',
					name: 'WorkflowOutput',
					type: { kind: 'reference', reference },
				},
			],
			kind: 'declaration',
			outputPath: 'workflow.generated.d.ts',
		})
		registrars.outputs.emit({
			contributionId: 'metadata',
			kind: 'metadata',
			metadata: { flags: [true, null, 1, 'ready'] },
			outputPath: 'workflow.generated.json',
		})

		const snapshot = snapshotTypegenDeclarations(declarations)
		expect(snapshot.contributions[0]).toMatchObject({
			augmentations: [{ target: 'Editorial' }],
			owner,
		})
		expect(snapshot.outputs.map(({ kind }) => kind)).toStrictEqual([
			'declaration',
			'metadata',
		])
	})

	it('rejects malformed contributions and outputs at registration time', () => {
		const { registrars } = createFixture()
		const add = (value: unknown): void => {
			registrars.contributions.add(value as TypegenStructuredContribution)
		}
		const emit = (value: unknown): void => {
			registrars.outputs.emit(value as TypegenOutputDeclarationOptions)
		}
		const invalidContributions: readonly [unknown, string][] = [
			[null, 'plain object'],
			[{ contributionId: 'empty' }, 'must contain declarations'],
			[{ contributionId: 'unknown', raw: 'type X = string' }, 'unknown option'],
			[
				{ contributionId: 'invalid', declarations: 'no' },
				'declarations must be a list',
			],
			[
				{ augmentations: [null], contributionId: 'invalid' },
				'must be a schema augmentation',
			],
			[
				{ augmentations: [{ target: 'Editorial' }], contributionId: 'invalid' },
				'must augment schema or model',
			],
			[
				{
					augmentations: [
						{ schema: [], target: 'Editorial' },
						{ model: [], target: 'Editorial' },
					],
					contributionId: 'invalid',
				},
				'duplicate target',
			],
		]
		for (const [value, message] of invalidContributions) {
			expect(() => {
				add(value)
			}).toThrow(message)
		}

		const invalidOutputs: readonly [unknown, string][] = [
			[null, 'plain object'],
			[
				{ contributionId: 'invalid', kind: 'client', outputPath: 'x.js' },
				'kind must be declaration or metadata',
			],
			[
				{
					contributionId: 'invalid',
					declarations: [],
					kind: 'declaration',
					outputPath: 'x.ts',
				},
				'must end in .d.ts',
			],
			[
				{
					contributionId: 'invalid',
					declarations: [],
					kind: 'declaration',
					outputPath: 'x.d.ts',
				},
				'must contain at least one declaration',
			],
			[
				{
					contributionId: 'invalid',
					kind: 'metadata',
					metadata: {},
					outputPath: 'x.txt',
				},
				'must end in .json',
			],
			[
				{
					contributionId: 'invalid',
					kind: 'metadata',
					metadata: { callback: () => undefined },
					outputPath: 'x.json',
				},
				'only JSON values',
			],
		]
		for (const [value, message] of invalidOutputs) {
			expect(() => {
				emit(value)
			}).toThrow(message)
		}
	})

	it('enforces nominal, unique references and closed registration sessions', () => {
		let open = true
		const declarations: MutableTypegenDeclarations = {
			contributions: [],
			outputs: [],
			references: [],
		}
		const registrars = createTypegenRegistrars(owner, declarations, () => {
			if (!open) throw new TypeError('closed')
		})
		const reference = defineTypegenReference({
			exportName: 'State',
			module: 'x',
		})

		expect(() => {
			registrars.references.register({
				exportName: 'State',
				module: 'x',
			} as TypegenReference)
		}).toThrow('must be created')
		registrars.references.register(reference)
		expect(() => {
			registrars.references.register(reference)
		}).toThrow('already registered')
		open = false
		expect(() => {
			registrars.contributions.add({ contributionId: 'closed' })
		}).toThrow('closed')
	})
})
