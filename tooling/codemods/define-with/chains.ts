// Reads one declaration chain, `X.define({ … }).softDelete().with({ … })`,
// and plans the `.with` callback from its object, entries copied verbatim.
import ts from 'typescript'

import { nextToken, readComments } from './edits.ts'

/** The official shape methods that became `define` feature keys. */
export const officialFeatures: readonly string[] = ['acl', 'softDelete']
export const roleOptionNames = new Set(['deletion', 'ensure', 'resolveCurrent'])
const identifierPattern = /^[A-Za-z_$][\w$]*$/u

export interface ChainLink {
	readonly call: ts.CallExpression
	readonly name: string
}

export interface Chain {
	readonly links: readonly ChainLink[]
	readonly define: ts.CallExpression | undefined
	readonly top: ts.CallExpression
	/** Calls between `define` and the links that are not known features. */
	readonly unknown: readonly string[]
}

export const isMethodCall = (
	node: ts.Node,
	names: ReadonlySet<string>,
): boolean =>
	ts.isCallExpression(node) &&
	ts.isPropertyAccessExpression(node.expression) &&
	names.has(node.expression.name.text)

export const methodName = (call: ts.CallExpression): string =>
	ts.isPropertyAccessExpression(call.expression)
		? call.expression.name.text
		: ''

export const receiverOf = (call: ts.CallExpression): ts.Expression =>
	ts.isPropertyAccessExpression(call.expression)
		? call.expression.expression
		: call.expression

// Whether `call` is the receiver of a further chain link (not the chain top).
export const continuesChain = (
	call: ts.Node,
	linkNames: ReadonlySet<string>,
): boolean =>
	ts.isPropertyAccessExpression(call.parent) &&
	call.parent.expression === call &&
	linkNames.has(call.parent.name.text) &&
	ts.isCallExpression(call.parent.parent) &&
	call.parent.parent.expression === call.parent

export const readChain = (
	top: ts.CallExpression,
	linkNames: ReadonlySet<string>,
): Chain => {
	const links: ChainLink[] = []
	let current: ts.Expression = top
	while (ts.isCallExpression(current) && isMethodCall(current, linkNames)) {
		links.unshift({ call: current, name: methodName(current) })
		current = receiverOf(current)
	}
	// Other method calls before `define`: shape methods the codemod was not told about.
	const unknown: string[] = []
	while (
		ts.isCallExpression(current) &&
		ts.isPropertyAccessExpression(current.expression) &&
		methodName(current) !== 'define'
	) {
		unknown.unshift(methodName(current))
		current = receiverOf(current)
	}
	const define =
		ts.isCallExpression(current) && methodName(current) === 'define'
			? current
			: undefined
	return { links, define, top, unknown: define === undefined ? [] : unknown }
}

export const isRoleDefine = (define: ts.CallExpression): boolean =>
	/(?:^|\.)RoleSchema$/u.test(receiverOf(define).getText())

export const propertyName = (
	property: ts.ObjectLiteralElementLike,
): string | undefined => {
	if (
		!ts.isPropertyAssignment(property) &&
		!ts.isShorthandPropertyAssignment(property)
	) {
		return undefined
	}
	const { name } = property
	if (ts.isIdentifier(name)) return name.text
	return ts.isStringLiteral(name) && identifierPattern.test(name.text)
		? name.text
		: undefined
}

// The value of one `.with` entry with the comments after its colon.
export const entryValue = (
	text: string,
	property: ts.ObjectLiteralElementLike,
): string =>
	ts.isPropertyAssignment(property)
		? text.slice(nextToken(text, property.name.end) + 1, property.end).trim()
		: property.getText()

// Comments of a trivia span: kept on their own line, blank space dropped.
const triviaText = (trivia: string): string =>
	trivia.trim() === '' ? (trivia.includes('\n') ? '\n' : '') : trivia

export interface WithPlan {
	readonly builder: readonly string[]
	readonly trailing: string
	readonly indexes:
		ts.PropertyAssignment | ts.ShorthandPropertyAssignment | undefined
}

export const planWith = (
	text: string,
	object: ts.ObjectLiteralExpression,
): WithPlan | undefined => {
	const builder: string[] = []
	let indexes: WithPlan['indexes']
	for (const property of object.properties) {
		const name = propertyName(property)
		if (name === undefined) return undefined
		if (
			name === 'indexes' &&
			(ts.isPropertyAssignment(property) ||
				ts.isShorthandPropertyAssignment(property))
		) {
			indexes = property
			continue
		}
		const leading = text.slice(property.getFullStart(), property.getStart())
		builder.push(
			`${triviaText(leading)}.${name}(${entryValue(text, property)})`,
		)
	}
	const last = object.properties.at(-1)
	const afterLast =
		last === undefined
			? object.getStart() + 1
			: text[nextToken(text, last.end)] === ','
				? nextToken(text, last.end) + 1
				: last.end
	const trailing = text.slice(afterLast, object.end - 1)
	return {
		builder,
		trailing: trailing.trim() === '' ? '' : trailing.trimEnd(),
		indexes,
	}
}

// Index entries of a `.with` `indexes` value, with their comments.
export const indexEntries = (
	text: string,
	property: ts.PropertyAssignment | ts.ShorthandPropertyAssignment,
): string[] => {
	const comments = readComments(text, property.getFullStart())
	const value = ts.isPropertyAssignment(property)
		? property.initializer
		: property.name
	const entries = ts.isArrayLiteralExpression(value)
		? value.elements.map((element) =>
				text.slice(element.getFullStart(), element.end).trim(),
			)
		: [`...${value.getText()}`]
	const [first, ...rest] = entries
	return first === undefined ? [] : [[...comments, first].join('\n'), ...rest]
}

export const locateLine = (source: ts.SourceFile, node: ts.Node): number =>
	source.getLineAndCharacterOfPosition(node.getStart()).line + 1
