import type {
	TypegenApplicationSnapshot,
	TypegenFieldSnapshot,
	TypegenReference,
} from '../snapshot.js'
import { quote, typeIdentifier } from './syntax.js'

const referenceKey = (reference: TypegenReference): string =>
	`${reference.module}\u0000${reference.exportName}`

/** Lists every external type a field tree references, depth first. */
const fieldReferences = (
	fields: readonly TypegenFieldSnapshot[],
): TypegenReference[] =>
	fields.flatMap((field) => [
		...(field.structuralContains === undefined
			? []
			: [field.structuralContains]),
		...(field.value.kind === 'plugin' ? [field.value.reference] : []),
		...(field.value.kind === 'object'
			? fieldReferences(field.value.fields)
			: []),
	])

/** Collects stable aliases for every external type referenced by the output. */
export class ReferenceImports {
	readonly #aliases = new Map<string, string>()
	/** Import specifiers grouped by module, both in rendering order. */
	readonly #modules = new Map<string, string[]>()

	constructor(snapshot: TypegenApplicationSnapshot) {
		const candidates = [
			...snapshot.fieldMethods.flatMap((method) => [
				method.method,
				method.value,
				...(method.structuralContains === undefined
					? []
					: [method.structuralContains]),
			]),
			...snapshot.schemas.flatMap((schema) => [
				...fieldReferences(schema.fields),
				...fieldReferences(schema.virtualFields),
			]),
			...snapshot.options.flatMap((option) =>
				option.compatibility === undefined
					? [option.reference]
					: [option.reference, option.compatibility],
			),
			...snapshot.operations.flatMap(({ input, result }) => [input, result]),
			...snapshot.surfaces.flatMap((surface) =>
				surface.schemaMutations.map(({ input }) => input),
			),
		]
		// The last occurrence of a module and export pair wins, as in a keyed map.
		const references = new Map<string, TypegenReference>()

		for (const reference of candidates) {
			if (reference !== undefined) {
				references.set(referenceKey(reference), reference)
			}
		}

		const ordered = [...references.values()].sort((left, right) =>
			left.module === right.module
				? left.exportName.localeCompare(right.exportName)
				: left.module.localeCompare(right.module),
		)
		const moduleIndexes = new Map(
			[...new Set(ordered.map(({ module }) => module))]
				.sort()
				.map((module, index) => [module, index]),
		)

		for (const reference of ordered) {
			const alias = `Plugin${String(moduleIndexes.get(reference.module))}_${typeIdentifier(reference.exportName)}`
			const specifiers = this.#modules.get(reference.module) ?? []

			this.#aliases.set(referenceKey(reference), alias)
			specifiers.push(`\t${reference.exportName} as ${alias},`)
			this.#modules.set(reference.module, specifiers)
		}
	}

	alias(reference: TypegenReference): string {
		const alias = this.#aliases.get(referenceKey(reference))

		if (alias === undefined) {
			throw new TypeError(
				`Missing generated import for ${reference.module}:${reference.exportName}`,
			)
		}

		return alias
	}

	render(): string {
		return [...this.#modules]
			.map(
				([module, specifiers]) =>
					`import type {\n${specifiers.join('\n')}\n} from ${quote(module)}`,
			)
			.join('\n')
	}
}
