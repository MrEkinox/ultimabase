//#region operations
import { defineOperation, defineOperationValue } from '@ultimabase/core/plugin'

const text = defineOperationValue((value, path): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be text`)
	}
	return value
})

/** An app-wide command with no database work: it forbids a transaction. */
export const formatWorkflow = defineOperation({
	input: text,
	name: 'community.workflow.format',
	result: text,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
//#endregion operations
