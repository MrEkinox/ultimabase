import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type {
	HookValidationIssue,
	HookValidationIssueCode,
} from '../../schema/hooks/contracts.js'

/** Runs immutable transforms in declaration order and feeds replacements forward. */
export const runHookTransformChain = async <THandler, TValue>(
	handlers: readonly THandler[],
	initialValue: TValue,
	invoke: (
		handler: THandler,
		value: TValue,
		index: number,
	) => MaybePromise<TValue | undefined>,
): Promise<TValue> => {
	let value = initialValue

	for (const [index, handler] of handlers.entries()) {
		const replacement = await invoke(handler, value, index)

		// An observer-style transform keeps the current value by returning undefined.
		if (replacement !== undefined) {
			value = replacement
		}
	}

	return value
}

const isHookValidationIssueCode = (
	value: unknown,
): value is HookValidationIssueCode => {
	if (typeof value !== 'string') {
		return false
	}

	const segments = value.split('.')

	return segments.length >= 2 && segments.every((segment) => segment.length > 0)
}

const isValidationPathSegment = (value: unknown): value is number | string =>
	typeof value === 'string' ||
	(typeof value === 'number' && Number.isInteger(value) && value >= 0)

/** Validates and snapshots one untrusted callback issue without retaining its state. */
const normalizeHookValidationIssue = (
	value: unknown,
	path: string,
): HookValidationIssue => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a validation issue object`)
	}

	if (!isHookValidationIssueCode(value.code)) {
		throw new TypeError(`${path}.code must be a namespaced issue code`)
	}

	if (typeof value.message !== 'string' || value.message.length === 0) {
		throw new TypeError(`${path}.message must be a non-empty string`)
	}

	if (
		!isUnknownArray(value.path) ||
		!value.path.every(isValidationPathSegment)
	) {
		throw new TypeError(
			`${path}.path must contain only property names or non-negative indexes`,
		)
	}

	return immutableRecord({
		code: value.code,
		message: value.message,
		path: immutableArray(value.path),
	})
}

/** Aggregates validated issue snapshots without exposing mutable hook state. */
export const runHookValidations = async <THandler>(
	handlers: readonly THandler[],
	invoke: (handler: THandler, index: number) => MaybePromise<unknown>,
): Promise<readonly HookValidationIssue[]> => {
	const issues: HookValidationIssue[] = []

	for (const [index, handler] of handlers.entries()) {
		const reportedIssues = await invoke(handler, index)

		if (reportedIssues === undefined) {
			continue
		}

		if (!isUnknownArray(reportedIssues)) {
			throw new TypeError(
				`Hook validation handler ${String(index)} must return an issue list or undefined`,
			)
		}

		for (const [issueIndex, issue] of reportedIssues.entries()) {
			issues.push(
				normalizeHookValidationIssue(
					issue,
					`Hook validation handler ${String(index)} issue ${String(issueIndex)}`,
				),
			)
		}
	}

	return immutableArray(issues)
}

/** Executes effects sequentially so declaration order remains observable and deterministic. */
export const runHookEffects = async <THandler>(
	handlers: readonly THandler[],
	invoke: (handler: THandler, index: number) => MaybePromise<void>,
): Promise<void> => {
	for (const [index, handler] of handlers.entries()) {
		await invoke(handler, index)
	}
}
