// The rewrites one chain conversion is made of: removing a chain link,
// building `plugins.roles({ … })`, merging `.with` indexes into `define`.
import ts from 'typescript'

import {
	indexEntries,
	methodName,
	receiverOf,
	type ChainLink,
	type WithPlan,
} from './chains.ts'
import {
	appendToList,
	lineIndentation,
	nextToken,
	propertyText,
	readComments,
	type TextEdit,
} from './edits.ts'

export const elementName = (
	element: ts.ObjectLiteralElementLike,
): string | undefined =>
	element.name !== undefined && ts.isIdentifier(element.name)
		? element.name.text
		: undefined

// Removes one chain link, keeping the comments before it that must stay.
export const removeLink = (
	text: string,
	link: ChainLink,
	keep: (comment: string) => boolean,
	extra: readonly string[] = [],
): TextEdit => {
	const start = receiverOf(link.call).end
	const indent = lineIndentation(text, nextToken(text, start))
	const kept = [...readComments(text, start).filter(keep), ...extra]
	return {
		start,
		end: link.call.end,
		replacement: kept.map((comment) => `\n${indent}${comment}`).join(''),
	}
}

export const isCallback = (node: ts.Expression): boolean =>
	ts.isArrowFunction(node) || ts.isFunctionExpression(node)

// Where `.roles({ … })` goes in a callback `(plugins) => plugins.access(…)`.
export const builderHead = (callback: ts.Expression): number | undefined => {
	if (!ts.isArrowFunction(callback) || ts.isBlock(callback.body)) {
		return undefined
	}
	const [parameter] = callback.parameters
	if (parameter === undefined || !ts.isIdentifier(parameter.name)) {
		return undefined
	}
	let head: ts.Expression = callback.body
	while (ts.isCallExpression(head) || ts.isPropertyAccessExpression(head)) {
		head = head.expression
	}
	return ts.isIdentifier(head) && head.text === parameter.name.text
		? head.end
		: undefined
}

export const rolesCall = (
	text: string,
	properties: readonly ts.ObjectLiteralElementLike[],
): string => {
	const entries = properties.map((property) => propertyText(text, property))
	return entries.some((entry) => entry.includes('\n') || entry.includes('//'))
		? `.roles({\n${entries.join(',\n')},\n})`
		: `.roles({ ${entries.join(', ')} })`
}

// Moves `.with({ indexes })` entries into `define`, merged after its own.
export const moveIndexes = (
	text: string,
	object: ts.ObjectLiteralExpression,
	moved: NonNullable<WithPlan['indexes']>,
): { edits: TextEdit[]; entry: string | undefined } => {
	const entries = indexEntries(text, moved)
	const existing = object.properties.find(
		(property) =>
			(ts.isPropertyAssignment(property) ||
				ts.isShorthandPropertyAssignment(property)) &&
			ts.isIdentifier(property.name) &&
			property.name.text === 'indexes',
	)
	if (existing === undefined) {
		return {
			edits: [],
			entry: [
				...readComments(text, moved.getFullStart()),
				moved.getText(),
			].join('\n'),
		}
	}
	if (ts.isShorthandPropertyAssignment(existing)) {
		return {
			edits: [
				{
					start: existing.getStart(),
					end: existing.end,
					replacement: `indexes: [...indexes, ${entries.join(', ')}]`,
				},
			],
			entry: undefined,
		}
	}
	if (!ts.isPropertyAssignment(existing)) return { edits: [], entry: undefined }
	const value = existing.initializer
	return {
		edits: ts.isArrayLiteralExpression(value)
			? appendToList(
					text,
					value.elements,
					value.getStart(),
					value.end - 1,
					entries,
				)
			: [
					{
						start: value.getStart(),
						end: value.end,
						replacement: `[...${value.getText()}, ${entries.join(', ')}]`,
					},
				],
		entry: undefined,
	}
}

// Whether `node` sits in a callback passed to `.with(...)`.
export const isInWithCallback = (node: ts.Node): boolean => {
	for (
		let current: ts.Node = node;
		!ts.isSourceFile(current);
		current = current.parent
	) {
		if (
			isCallback(current as ts.Expression) &&
			ts.isCallExpression(current.parent) &&
			methodName(current.parent) === 'with'
		) {
			return true
		}
	}
	return false
}
