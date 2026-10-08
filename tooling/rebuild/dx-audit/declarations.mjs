// Part (a): normalized emitted declaration files of each published package.
import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

/** Lists the `types` targets of a package.json `exports` field, per subpath. */
export const exportTypeEntries = (packageJson) => {
	const exportsField = packageJson.exports ?? {}
	const subpaths =
		typeof exportsField === 'string' ||
		!Object.keys(exportsField).some((key) => key.startsWith('.'))
			? { '.': exportsField }
			: exportsField
	const typesOf = (target) => {
		if (target === null || typeof target !== 'object') return []
		return Object.entries(target).flatMap(([condition, value]) =>
			condition === 'types' && typeof value === 'string'
				? [value]
				: typesOf(value),
		)
	}

	return Object.entries(subpaths).flatMap(([subpath, target]) =>
		typesOf(target).map((types) => ({ subpath, types })),
	)
}

/** Lists published packages (non-private `packages/*` with exports) of a root. */
export const listPackages = (root) =>
	fs
		.readdirSync(path.join(root, 'packages'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((entry) => {
			const manifest = path.join(root, 'packages', entry.name, 'package.json')

			if (!fs.existsSync(manifest)) return []
			const packageJson = JSON.parse(fs.readFileSync(manifest, 'utf8'))

			return packageJson.private === true || packageJson.exports === undefined
				? []
				: [
						{
							directory: entry.name,
							entries: exportTypeEntries(packageJson),
							name: packageJson.name,
						},
					]
		})
		.sort((left, right) => left.directory.localeCompare(right.directory))

// Only bundler region markers and source-map links are irrelevant to users.
const normalizeDeclarationText = (text) =>
	text
		.split('\n')
		.filter(
			(line) =>
				!/^\s*\/\/#\s*(?:region\b|endregion\b|sourceMappingURL=)/.test(line),
		)
		.join('\n')
		.trim()

const relativeSpecifiers = (sourceFile) => {
	const specifiers = []
	const visit = (node) => {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier !== undefined &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			specifiers.push(node.moduleSpecifier.text)
		}
		if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
			const literal = node.argument.literal

			if (ts.isStringLiteral(literal)) specifiers.push(literal.text)
		}
		ts.forEachChild(node, visit)
	}

	visit(sourceFile)
	return specifiers.filter((specifier) => specifier.startsWith('.'))
}

const resolveDeclarationFile = (fromFile, specifier) => {
	const base = path.resolve(path.dirname(fromFile), specifier)
	const candidates = [
		base.replace(/\.(m|c)?js$/, '.d.$1ts'),
		`${base}.d.ts`,
		path.join(base, 'index.d.ts'),
		base,
	]

	return candidates.find(
		(candidate) => candidate.endsWith('.ts') && fs.existsSync(candidate),
	)
}

const statementKeys = (statement) => {
	// SyntaxKind names VariableStatement `FirstStatement`; the other kinds are unambiguous.
	const kind = ts.SyntaxKind[statement.kind]

	if (ts.isVariableStatement(statement)) {
		return statement.declarationList.declarations.map(
			(declaration) => `VariableStatement ${declaration.name.getText()}`,
		)
	}
	if (ts.isImportDeclaration(statement))
		return [`import from ${statement.moduleSpecifier.getText()}`]
	if (ts.isExportDeclaration(statement)) return ['export statement']
	if (ts.isExportAssignment(statement)) return ['export assignment']
	if (statement.name !== undefined)
		return [`${kind} ${statement.name.getText()}`]
	return [`${kind} (anonymous)`]
}

const exportedLocalNames = (sourceFile) =>
	new Set(
		sourceFile.statements.flatMap((statement) =>
			ts.isExportDeclaration(statement) &&
			statement.moduleSpecifier === undefined &&
			statement.exportClause !== undefined &&
			ts.isNamedExports(statement.exportClause)
				? statement.exportClause.elements.map((element) =>
						(element.propertyName ?? element.name).getText(),
					)
				: [],
		),
	)

/**
 * Collects one record per top-level declaration of the package declaration
 * files reachable from its `exports` types. Records are keyed by kind and
 * name, so moving a declaration inside a file does not count as a change,
 * while renaming (including private `$1` aliases) does.
 */
export const collectDeclarations = (root, packageInfo) => {
	const packageDirectory = path.join(root, 'packages', packageInfo.directory)
	const pending = packageInfo.entries.map(({ types }) =>
		path.join(packageDirectory, types),
	)
	const visited = new Set()
	const texts = new Map()
	const records = []

	while (pending.length > 0) {
		const fileName = pending.shift()

		if (visited.has(fileName)) continue
		visited.add(fileName)
		if (!fs.existsSync(fileName)) {
			records.push({
				key: `file ${path.relative(packageDirectory, fileName)}`,
				value: 'missing',
			})
			continue
		}
		const sourceFile = ts.createSourceFile(
			fileName,
			fs.readFileSync(fileName, 'utf8'),
			ts.ScriptTarget.Latest,
			true,
		)
		const exported = exportedLocalNames(sourceFile)

		for (const specifier of relativeSpecifiers(sourceFile)) {
			const target = resolveDeclarationFile(fileName, specifier)

			if (target !== undefined) pending.push(target)
		}
		for (const statement of sourceFile.statements) {
			const text = normalizeDeclarationText(statement.getFullText())

			for (const key of statementKeys(statement)) {
				const name = key.slice(key.indexOf(' ') + 1)
				const previous = texts.get(key)

				texts.set(key, {
					exported: previous?.exported === true || exported.has(name),
					file: path.relative(packageDirectory, fileName),
					text: previous === undefined ? text : `${previous.text}\n${text}`,
				})
			}
		}
	}

	for (const [key, { exported, file, text }] of texts) {
		records.push({
			key,
			location: `${file}${exported ? ' (exported)' : ' (private)'}`,
			value: text,
		})
	}
	return records
}

/**
 * Pairs a declaration missing from one side with an added one whose text is
 * identical once the two names are swapped: the typical private alias rename.
 */
export const findRenames = (differences) => {
	const nameOf = (key) => key.slice(key.lastIndexOf(' ') + 1)
	const kindOf = (key) => key.slice(0, key.lastIndexOf(' '))
	const removed = differences.filter(
		(difference) => difference.rebuild === undefined,
	)
	const added = differences.filter(
		(difference) => difference.reference === undefined,
	)

	for (const left of removed) {
		const match = added.find(
			(right) =>
				kindOf(right.key) === kindOf(left.key) &&
				right.rebuild.split(nameOf(right.key)).join('\u0000') ===
					left.reference.split(nameOf(left.key)).join('\u0000'),
		)

		if (match !== undefined) {
			left.note = `same text as rebuild \`${match.key}\` (renamed)`
			match.note = `same text as reference \`${left.key}\` (renamed)`
		}
	}
}
