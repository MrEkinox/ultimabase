import { FrameworkError, type Logger } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { createDenialLog } from './denial-log.js'

const denial = new FrameworkError('PERMISSION_DENIED', 'Native Access denied.', {
	internalDetails: {
		kind: 'access-rule-denied',
		phase: 'access-operation',
		rule: 'Post.access.read',
		schema: 'Post',
	},
})

const capture = (operation: string): readonly string[] => {
	const lines: string[] = []
	const record = (message: string): void => {
		lines.push(message)
	}
	const logger: Logger = {
		debug: record,
		error: record,
		info: record,
		warn: record,
	}
	createDenialLog(logger, 'development')(denial, operation)
	return lines
}

describe('denial log operation names', () => {
	// ADR-0347: the log names the read methods, as rules and messages do.
	it.each([
		['one', 'findOne'],
		['many', 'findMany'],
		['count', 'count'],
		['update', 'update'],
		['softDelete', 'softDelete'],
	])('prints %s as %s', (operation, printed) => {
		expect(capture(operation)).toEqual([
			`denied ${printed} on Post at the operation step (Post.access.read).`,
		])
	})
})
