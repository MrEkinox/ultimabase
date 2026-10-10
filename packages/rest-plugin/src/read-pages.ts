import type {
	ApplicationRequestExecutor,
	RequestContext,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { invalidRestRead } from './errors.js'
import { encodeRestSchemaResult } from './response-values.js'
import { createRestJsonResponse } from './responses.js'
import { encodeRestNextCursor } from './read-cursors.js'
import {
	decodeRestReadInput,
	normalizeRestReadInput,
	type RestReadLimits,
} from './reads.js'

/** One `find` page: the rows, the next cursor and the fields added for it. */
export interface RestFindPage {
	readonly hidden: ReadonlySet<string>
	/** Absent when the request uses `skip` (ADR-0309, decision 6). */
	readonly nextCursor?: string | null
	readonly results: readonly unknown[]
}

const noHiddenFields: ReadonlySet<string> = new Set()
const invalidResult = (): TypeError => new TypeError('Invalid REST result')

/**
 * Makes the ordered fields and `id` part of an explicit selection so the last
 * row can be encoded, and lists the ones the caller did not ask for.
 */
const selectOrderedFields = (
	select: unknown,
	ordered: readonly string[],
): Readonly<{ hidden: ReadonlySet<string>; select: unknown }> => {
	if (!isPlainRecord(select)) return { hidden: noHiddenFields, select }
	const inclusion = Object.values(select).some((value) => value === true)
	// `id` is part of every result (ADR-0181), so it is never hidden.
	const hidden = ordered.filter(
		(field) =>
			field !== 'id' &&
			(inclusion ? select[field] !== true : select[field] === false),
	)
	const entries = Object.entries(select).filter(
		([field]) => inclusion || !hidden.includes(field),
	)
	return {
		hidden: new Set(hidden),
		select: immutableRecord(
			Object.fromEntries(
				inclusion
					? [...entries, ...hidden.map((field) => [field, true] as const)]
					: entries,
			),
		),
	}
}

/**
 * Executes one REST `find` (ADR-0309): without `skip`, Core reads one extra
 * row so `nextCursor` is the position of the last returned row, or `null`.
 */
export const executeRestFindPage = async (
	executor: ApplicationRequestExecutor,
	context: RequestContext,
	schema: SchemaDefinition,
	request: Request,
	limits: RestReadLimits,
): Promise<RestFindPage> => {
	const input = { operation: 'find', request } as const
	const decoded = await decodeRestReadInput(schema, input, limits)
	const take = isPlainRecord(decoded) ? decoded.take : undefined
	if (
		!isPlainRecord(decoded) ||
		Object.hasOwn(decoded, 'skip') ||
		typeof take !== 'number'
	) {
		const results = await executor.executeRead(
			context,
			normalizeRestReadInput(schema, input, decoded),
		)
		if (!isUnknownArray(results))
			throw new TypeError('Invalid REST find result')
		return immutableRecord({ hidden: noHiddenFields, results })
	}
	const orderBy: unknown = decoded.orderBy
	const ordered = [
		...(isPlainRecord(orderBy) ? Object.keys(orderBy) : []),
		'id',
	]
	const { hidden, select } = selectOrderedFields(decoded.select, ordered)
	const rows = await executor.executeRead(
		context,
		normalizeRestReadInput(schema, input, {
			...decoded,
			take: take + 1,
			...(select === undefined ? {} : { select }),
		}),
	)
	if (!isUnknownArray(rows)) throw new TypeError('Invalid REST find result')
	const results = immutableArray(rows.slice(0, take))
	const last = results.at(-1)
	return immutableRecord({
		hidden,
		nextCursor:
			rows.length > take && last !== undefined
				? encodeRestNextCursor(schema, orderBy, last, invalidRestRead)
				: null,
		results,
	})
}

/**
 * Answers one `find` with `results` and, without `skip`, `nextCursor`
 * (ADR-0309); fields added only to encode the cursor are not returned.
 */
export const createRestFindResponse = (
	schema: SchemaDefinition,
	page: RestFindPage,
): Response => {
	const encode = (value: unknown): Readonly<Record<string, unknown>> => {
		const encoded = encodeRestSchemaResult(schema, value, invalidResult)
		return page.hidden.size === 0
			? encoded
			: immutableRecord(
					Object.fromEntries(
						Object.entries(encoded).filter(
							([field]) => !page.hidden.has(field),
						),
					),
				)
	}
	return createRestJsonResponse(
		{
			results: page.results.map(encode),
			...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
		},
		200,
	)
}
