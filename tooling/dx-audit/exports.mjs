// Part (b): export list, export hovers and one-level member hovers, read
// through a generated probe program that is identical for both roots.
import path from 'node:path'

import ts from 'typescript'

import {
	completionValue,
	createProject,
	defaultCompilerOptions,
	quickInfoValue,
} from './language-service.mjs'

const completionLine = 'import {  } from'

const probeFileName = (context, packageInfo, subpath) =>
	path.join(
		context.root,
		`.dx-audit-probe.${packageInfo.directory}${subpath === '.' ? '' : subpath.slice(1).replaceAll('/', '.')}.ts`,
	)

const specifierOf = (packageInfo, subpath) =>
	subpath === '.' ? packageInfo.name : `${packageInfo.name}/${subpath.slice(2)}`

/** The probe source only depends on the specifier and the (union) export names. */
const probeSource = (specifier, names) =>
	[
		// No namespace import: it would make hovers print `Module.Type` qualifiers.
		`${completionLine} '${specifier}'`,
		...names.map((name) => `import { ${name} } from '${specifier}'`),
		'',
	].join('\n')

const meaningOf = (symbol) =>
	[
		[ts.SymbolFlags.Value, 'value'],
		[ts.SymbolFlags.Type, 'type'],
		[ts.SymbolFlags.Namespace, 'namespace'],
	]
		.filter(([flag]) => (symbol.flags & flag) !== 0)
		.map(([, meaning]) => meaning)
		.join('+')

const resolveAlias = (checker, symbol) =>
	(symbol.flags & ts.SymbolFlags.Alias) === 0
		? symbol
		: checker.getAliasedSymbol(symbol)

const subpathsOf = (packageInfo) => [
	...new Set(packageInfo.entries.map(({ subpath }) => subpath)),
]

const createProbeProject = (context, packages, namesFor) => {
	const files = new Map()

	for (const packageInfo of packages) {
		for (const subpath of subpathsOf(packageInfo)) {
			files.set(
				probeFileName(context, packageInfo, subpath),
				probeSource(
					specifierOf(packageInfo, subpath),
					namesFor(packageInfo, subpath),
				),
			)
		}
	}
	return createProject(context, defaultCompilerOptions, files)
}

/** Lists export names (with their meanings) of every published entry point. */
export const listExports = (context, packages) => {
	const service = createProbeProject(context, packages, () => [])
	const checker = service.getProgram().getTypeChecker()
	const result = new Map()

	for (const packageInfo of packages) {
		for (const subpath of subpathsOf(packageInfo)) {
			const sourceFile = service
				.getProgram()
				.getSourceFile(probeFileName(context, packageInfo, subpath))
			const moduleSymbol = checker.getSymbolAtLocation(
				sourceFile.statements[0].moduleSpecifier,
			)
			const exported =
				moduleSymbol === undefined
					? []
					: checker.getExportsOfModule(moduleSymbol)

			result.set(
				`${packageInfo.directory}${subpath}`,
				new Map(
					exported.map((symbol) => [
						symbol.name,
						meaningOf(resolveAlias(checker, symbol)),
					]),
				),
			)
		}
	}
	return result
}

const partsText = (parts) => ts.displayPartsToString(parts)

/** Groups of `[prefix, properties]` shown one level below an export. */
const memberGroups = (checker, target) => {
	const groups = []
	const typeDeclarations =
		ts.SymbolFlags.Interface | ts.SymbolFlags.Class | ts.SymbolFlags.TypeAlias
	// Unions of primitives would only list lib members (e.g. String methods).
	const isObjectLike = (type) =>
		(type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) !== 0 ||
		(type.isUnion() && type.types.every(isObjectLike))

	if ((target.flags & typeDeclarations) !== 0) {
		const declared = checker.getDeclaredTypeOfSymbol(target)

		if (isObjectLike(declared))
			groups.push(['', checker.getPropertiesOfType(declared)])
	}
	if ((target.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Variable)) !== 0) {
		const valueType = checker.getTypeOfSymbol(target)
		const prefix =
			(target.flags & ts.SymbolFlags.Class) === 0 ? 'value ' : 'static '

		groups.push([
			prefix,
			checker
				.getPropertiesOfType(valueType)
				.filter((member) => member.name !== 'prototype'),
		])
	}
	return groups
}

const memberValue = (context, service, checker, member) => {
	const declaration = member.valueDeclaration ?? member.declarations?.[0]
	const name =
		declaration === undefined ? undefined : ts.getNameOfDeclaration(declaration)
	const hover =
		name === undefined
			? null
			: quickInfoValue(
					context,
					service.getQuickInfoAtPosition(
						name.getSourceFile().fileName,
						name.getStart(),
					),
				)

	return {
		documentation: context.normalize(
			partsText(member.getDocumentationComment(checker)),
		),
		hover,
		tags: member
			.getJsDocTags(checker)
			.map((tag) =>
				context.normalize(
					`@${tag.name} ${partsText(tag.text ?? [])}`.trimEnd(),
				),
			),
		type: context.normalize(
			checker.typeToString(checker.getTypeOfSymbol(member)),
		),
	}
}

/**
 * Hovers each export at its import specifier (what users see on import) and
 * every member one level deep. `unionNames` makes both probes identical.
 */
export const collectExportHovers = (context, packages, unionNames) => {
	const service = createProbeProject(
		context,
		packages,
		(packageInfo, subpath) =>
			unionNames.get(`${packageInfo.directory}${subpath}`) ?? [],
	)
	const program = service.getProgram()
	const checker = program.getTypeChecker()
	const records = []

	for (const packageInfo of packages) {
		for (const subpath of subpathsOf(packageInfo)) {
			const fileName = probeFileName(context, packageInfo, subpath)
			const sourceFile = program.getSourceFile(fileName)
			const entry = subpath === '.' ? '' : `${subpath} `
			const push = (section, key, value) =>
				records.push({
					group: packageInfo.directory,
					key: `${entry}${key}`,
					section,
					value,
				})

			push(
				'export-completions',
				'import { | }',
				completionValue(
					context,
					service.getCompletionsAtPosition(
						fileName,
						sourceFile.text.indexOf(completionLine) + 'import { '.length,
						{},
					),
				),
			)
			for (const statement of sourceFile.statements.slice(1)) {
				if (!ts.isImportDeclaration(statement)) continue
				const specifier = statement.importClause.namedBindings.elements[0]
				const exportName = specifier.name.text

				push(
					'export-hover',
					exportName,
					quickInfoValue(
						context,
						service.getQuickInfoAtPosition(fileName, specifier.name.getStart()),
					),
				)
				const symbol = checker.getSymbolAtLocation(specifier.name)

				if (symbol === undefined) continue
				for (const [prefix, members] of memberGroups(
					checker,
					resolveAlias(checker, symbol),
				)) {
					for (const member of members) {
						push(
							'member-hover',
							// Symbol-keyed names embed checker ids (`__@name@123`); show them as `[name]`.
							`${exportName}.${prefix}${checker.symbolToString(member)}`,
							memberValue(context, service, checker, member),
						)
					}
				}
			}
		}
	}
	return records
}
