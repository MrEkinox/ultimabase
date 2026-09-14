import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Schema, UltimaBase } from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/typegen'

import {
	MutationTestAdapter,
	mutationDatabasePlugin,
} from './fixtures/mutations/test-adapter'
import { ultimabase } from './fixtures/mutations/ultimabase'

const mutationContentRoot = fileURLToPath(
	new URL('../content/docs/en/mutations/', import.meta.url),
)
const generatedPath = fileURLToPath(
	new URL(
		'./fixtures/mutations/.ultimabase/schema.generated.d.ts',
		import.meta.url,
	),
)
let generatedContents = ''

beforeAll(() => {
	generatedContents = generateApplicationTypes({
		application: ultimabase.application,
		applicationId: 'website-mutations',
	}).contents
})

afterAll(async () => {
	await ultimabase.dispose()
})

describe('mutation documentation contracts', () => {
	it('keeps the checked-in application declarations synchronized', async () => {
		const expected = await readFile(generatedPath, 'utf8')

		expect(generatedContents).toBe(expected)
	})

	it('executes representative public mutation commands transactionally', async () => {
		const RuntimeNote = Schema.define({
			className: 'WebsiteMutationRuntimeNote',
			fields: (field) => ({ title: field.string({ required: true }) }),
		})
		const created = {
			createdAt: '2026-09-14T10:00:00.000Z',
			id: '0199b38e-ef80-7000-8000-000000000001',
			title: 'Created',
			updatedAt: '2026-09-14T10:00:00.000Z',
		}
		const updated = { ...created, title: 'Updated' }
		const adapter = new MutationTestAdapter([
			{
				materializations: [{ current: created, kind: 'create' }],
				result: created,
			},
			{
				materializations: [
					{ current: updated, kind: 'update', previous: created },
				],
				result: updated,
				target: created,
			},
			{
				materializations: [{ kind: 'delete', previous: updated }],
				result: updated,
				target: updated,
			},
		])
		const runtime = new UltimaBase({
			plugins: [mutationDatabasePlugin(adapter)],
			schemas: [RuntimeNote],
		})

		try {
			await runtime.start()
			await RuntimeNote.createOne(
				{ data: { title: 'Created' } },
				{ ultimabase: runtime },
			)
			await RuntimeNote.updateOne(
				{ data: { title: 'Updated' }, id: created.id },
				{ ultimabase: runtime },
			)
			await RuntimeNote.deleteOne({ id: created.id }, { ultimabase: runtime })

			expect(adapter.trace).toEqual([
				'begin',
				'prepare:create-one',
				'execute:create-one',
				'commit',
				'begin',
				'prepare:update-one',
				'execute:update-one',
				'commit',
				'begin',
				'prepare:delete-one',
				'execute:delete-one',
				'commit',
			])
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			throw new Error(
				`${message}; adapter trace: ${adapter.trace.join(', ')}`,
				{
					cause: error,
				},
			)
		} finally {
			await runtime.dispose()
		}
	})

	it('rejects removed mutation escape hatches and unsupported semantics', async () => {
		const pageNames = [
			'bulk-operations',
			'create',
			'delete',
			'nested-writes',
			'soft-delete',
			'transactions',
			'update',
			'upserts',
		] as const
		const sources = await Promise.all(
			pageNames.map((pageName) =>
				readFile(`${mutationContentRoot}${pageName}.mdx`, 'utf8'),
			),
		)
		const documentedCode = sources
			.flatMap((source) => [
				...source.matchAll(/```ts[^\n]*\n(?<code>[\s\S]*?)```/gu),
			])
			.map((match) => match.groups?.code ?? '')
			.join('\n')

		expect(documentedCode).not.toMatch(/\.save\s*\(/u)
		expect(documentedCode).not.toMatch(/skipHooks/u)
		expect(documentedCode).not.toMatch(/atomic\s*:\s*false/u)
		expect(documentedCode).not.toMatch(/\b(?:delete|upsert)\s*:/u)
		expect(sources.join('\n')).toMatch(
			/Nested delete and upsert commands are not\s+available\./u,
		)
		expect(sources.join('\n')).toMatch(
			/there is no partial-success\s+branch\./u,
		)
		expect(sources.join('\n')).not.toMatch(
			/transaction\.(?:beforeCommit|afterCommit)/u,
		)
	})
})
