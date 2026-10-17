import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../../foundation.js'
import { QueryBuilder } from '../../plugin.js'
import {
	normalizeUpdateExpression,
	type CreateOneOperationAst,
	type UpdateOneOperationAst,
} from '../../query/index.js'
import { executeStage } from '../../../tests/fixtures/runtime-validation.js'
import { UltimaBase } from '../application/ultima-base.js'
import { createRuntimeValidationStage } from './runtime-validation.js'

// ADR-0340: a defaulted field rejects explicit null like `required: true`,
// unless it declares `nullable: true`.
const Article = UltimaBase.Schema.define({
	className: 'DefaultNullabilityArticle',
	fields: (field) => ({
		title: field.string({ required: true }),
		published: field.boolean({ default: false }),
		channel: field.string({ default: 'web', nullable: true }),
	}),
})
const schema = new QueryBuilder(Article).ast.schema

const issueCodes = (error: unknown): readonly unknown[] => {
	if (!(error instanceof FrameworkError)) {
		throw error
	}
	const details: unknown = error.publicDetails
	if (!isPlainRecord(details) || !isUnknownArray(details.issues)) {
		throw new TypeError('Expected validation issues')
	}
	return details.issues.map((issue) =>
		isPlainRecord(issue) ? [issue.code, issue.path] : issue,
	)
}

describe('default nullability (ADR-0340)', () => {
	it('fills omitted defaults and keeps the nullable opt-in clearable', async () => {
		const operation: CreateOneOperationAst<typeof Article> = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema,
			input: { title: 'Draft', channel: null },
		}
		const normalized = await executeStage(
			createRuntimeValidationStage(),
			operation,
		)

		expect(normalized.input).toMatchObject({
			channel: null,
			published: false,
			title: 'Draft',
		})
	})

	it('rejects explicit null on a defaulted field on create', async () => {
		const operation: CreateOneOperationAst<typeof Article> = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema,
			// @ts-expect-error -- Types reject it too.
			input: { title: 'Draft', published: null },
		}

		await expect(
			executeStage(createRuntimeValidationStage(), operation).catch(issueCodes),
		).resolves.toStrictEqual([['field.null', ['input', 'published']]])
	})

	it('rejects explicit null on a defaulted field on update', async () => {
		const query = new QueryBuilder(Article).where((where) =>
			where.eq('title', 'Draft'),
		)
		// @ts-expect-error -- Types reject it too.
		const update = normalizeUpdateExpression(Article, { published: null })
		const operation: UpdateOneOperationAst<typeof Article, typeof update> = {
			kind: 'update-one',
			query: query.ast,
			update,
		}

		await expect(
			executeStage(createRuntimeValidationStage(), operation).catch(issueCodes),
		).resolves.toStrictEqual([
			['field.null', ['update', 0, 'published', 'value']],
		])
	})
})
