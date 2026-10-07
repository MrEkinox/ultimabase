// Static extraction of the editor fixture sources a test file feeds to the
// TypeScript language service: embedded source strings (templates evaluated
// with same-file constants), sources built by the public API fixture helper,
// marker comments, and the on-disk fixture file names the test mentions.
import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

const isStringNode = (node) =>
	ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
const unwrap = (node) =>
	ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
		? unwrap(node.expression)
		: node

/**
 * Same-file string and string-array constants (and string-array constants of
 * relatively imported modules, such as shared removed-export lists).
 */
const readConstants = (sourceFile, followImports = true) => {
	const constants = new Map()
	const arrays = new Map()
	const literals = new Set(['/* hover */'])
	const define = (map, name, value) => {
		const previous = map.get(name)

		map.set(
			name,
			previous === undefined ||
				JSON.stringify(previous) === JSON.stringify(value)
				? value
				: null,
		)
	}
	const visit = (node) => {
		if (isStringNode(node)) literals.add(node.text)
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer !== undefined
		) {
			const initializer = unwrap(node.initializer)

			if (isStringNode(initializer))
				define(constants, node.name.text, initializer.text)
			if (
				ts.isArrayLiteralExpression(initializer) &&
				initializer.elements.every(isStringNode)
			) {
				define(
					arrays,
					node.name.text,
					initializer.elements.map((element) => element.text),
				)
			}
		}
		if (
			followImports &&
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text.startsWith('.')
		) {
			const target = path
				.resolve(path.dirname(sourceFile.fileName), node.moduleSpecifier.text)
				.replace(/\.js$/, '.ts')

			if (fs.existsSync(target)) {
				const imported = readConstants(
					ts.createSourceFile(
						target,
						fs.readFileSync(target, 'utf8'),
						ts.ScriptTarget.Latest,
						true,
					),
					false,
				)

				for (const [name, value] of imported.arrays)
					if (value !== null) define(arrays, name, value)
			}
		}
		ts.forEachChild(node, visit)
	}

	visit(sourceFile)
	return { arrays, constants, literals }
}

/**
 * Evaluates a template statically. Substitutions that are not same-file string
 * constants become empty text and are reported as unresolved.
 */
const evaluateTemplate = (node, constants, unresolved) => {
	if (!ts.isTemplateExpression(node)) return node.text
	return node.templateSpans.reduce((text, span) => {
		const expression = span.expression
		let value

		if (isStringNode(expression)) {
			value = expression.text
		} else if (
			ts.isIdentifier(expression) &&
			typeof constants.get(expression.text) === 'string'
		) {
			value = constants.get(expression.text)
		} else {
			unresolved.push(expression.getText())
			value = ''
		}
		return text + value + span.literal.text
	}, node.head.text)
}

// Embedded sources import a workspace package or a relative module of the test.
const importsModule =
	/(?:\bfrom\s*|\bimport\s*\(\s*)['"](?:@ultimabase\/|\.{1,2}\/)/
const markerPattern = /\/\*[^*\n]*\*\//g
const exportsMarker = '/* exports */'

/** Value of an object literal property (`name: value` or shorthand `name`). */
const propertyValue = (objectLiteral, name) => {
	const property = objectLiteral.properties.find(
		(candidate) => candidate.name?.getText() === name,
	)

	if (property === undefined) return undefined
	return ts.isShorthandPropertyAssignment(property)
		? property.name
		: unwrap(property.initializer)
}

/**
 * Reproduces the sources built by createPublicApiLanguageServiceFixture
 * (tooling/vitest/typescript-language-service.ts): export completions and the
 * diagnostics of removed export names.
 */
const publicApiSnippets = (node, constants, arrays) => {
	const specifierNode = propertyValue(node, 'moduleSpecifier')
	const specifier =
		specifierNode === undefined
			? undefined
			: isStringNode(specifierNode)
				? specifierNode.text
				: ts.isIdentifier(specifierNode)
					? constants.get(specifierNode.text)
					: undefined

	if (typeof specifier !== 'string') return []
	const removedNode = propertyValue(node, 'removedNames')
	const removed =
		removedNode === undefined
			? []
			: ts.isArrayLiteralExpression(removedNode) &&
				  removedNode.elements.every(isStringNode)
				? removedNode.elements.map((element) => element.text)
				: ts.isIdentifier(removedNode)
					? arrays.get(removedNode.text)
					: undefined
	const exportsSource = `import { ${exportsMarker} } from '${specifier}'`
	const snippets = [
		{
			markers: [
				{
					marker: exportsMarker,
					position: exportsSource.indexOf(exportsMarker),
				},
			],
			source: exportsSource.replace(
				exportsMarker,
				' '.repeat(exportsMarker.length),
			),
			unresolved: [],
		},
	]

	if (removed === undefined || removed === null) {
		snippets.push({
			markers: [],
			source: '',
			unresolved: [removedNode.getText()],
		})
	} else if (removed.length > 0) {
		snippets.push({
			markers: [],
			source: `import { ${removed.join(', ')} } from '${specifier}'`,
			unresolved: [],
		})
	}
	return snippets
}

/**
 * Blanks marker comments (comments the test file also spells as a string), as
 * the repository helpers do, and remembers their positions.
 */
export const replaceMarkers = (text, literals) => {
	const markers = []
	const source = text.replace(markerPattern, (marker, offset) => {
		if (!literals.has(marker)) return marker
		markers.push({ marker, position: offset })
		return ' '.repeat(marker.length)
	})

	return { markers, source }
}

/**
 * Extracts every embedded editor fixture source of a test or tooling file,
 * plus the TypeScript file names it mentions (on-disk fixture candidates).
 */
export const extractSnippets = (fileName, text) => {
	const sourceFile = ts.createSourceFile(
		fileName,
		text,
		ts.ScriptTarget.Latest,
		true,
	)
	const { arrays, constants, literals } = readConstants(sourceFile)
	const snippets = []
	const visit = (node) => {
		if (ts.isObjectLiteralExpression(node))
			snippets.push(...publicApiSnippets(node, constants, arrays))
		if (isStringNode(node) || ts.isTemplateExpression(node)) {
			const unresolved = []
			const evaluated = evaluateTemplate(node, constants, unresolved)

			if (importsModule.test(evaluated))
				snippets.push({ ...replaceMarkers(evaluated, literals), unresolved })
			if (!ts.isTemplateExpression(node)) return
		}
		ts.forEachChild(node, visit)
	}

	visit(sourceFile)
	const references = [...literals].filter((literal) =>
		/^[\w./-]+\.(?:m|c)?tsx?$/.test(literal),
	)

	return { literals, references, snippets }
}
