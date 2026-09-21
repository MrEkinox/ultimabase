import {
	assertNonEmptyString,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	PluginSchemaContributionOwner,
	SchemaCompilationProvenance,
	SchemaContributionOwner,
	SchemaContributionProvenance,
} from '../../schema/schema/provenance.js'

const contributionKeys = new Set([
	'contributionId',
	'normalizedStaticOptions',
	'owner',
	'protocolVersion',
])
const compilationKeys = new Set([
	'constraints',
	'fieldOptions',
	'fields',
	'indexes',
	'options',
	'patches',
	'schema',
])

const assertExactKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: ReadonlySet<string>,
	path: string,
): void => {
	const unknownKey = Reflect.ownKeys(value).find(
		(key) => typeof key !== 'string' || !keys.has(key),
	)
	if (unknownKey !== undefined) {
		throw new TypeError(`${path} contains unknown key: ${String(unknownKey)}`)
	}
}

const ownerIdentity = (owner: SchemaContributionOwner): string =>
	owner.kind === 'plugin'
		? `plugin:${owner.pluginId}:${owner.instanceId ?? ''}:${owner.version}`
		: owner.kind

function assertContributionOwner(
	value: unknown,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): asserts value is SchemaContributionOwner {
	if (!isPlainRecord(value)) throw new TypeError(`${path} must be an owner`)
	let identity: string
	if (value.kind === 'application' || value.kind === 'core') {
		assertExactKeys(value, new Set(['kind']), path)
		identity = value.kind
	} else if (value.kind === 'plugin') {
		assertExactKeys(
			value,
			new Set(['instanceId', 'kind', 'pluginId', 'version']),
			path,
		)
		assertNonEmptyString(value.pluginId, `${path}.pluginId`)
		assertNonEmptyString(value.version, `${path}.version`)
		if (value.instanceId !== undefined) {
			assertNonEmptyString(value.instanceId, `${path}.instanceId`)
		}
		identity = `plugin:${value.pluginId}:${value.instanceId ?? ''}:${value.version}`
	} else {
		throw new TypeError(`${path}.kind is unsupported`)
	}

	if (allowedOwners !== undefined && !allowedOwners.has(identity)) {
		throw new TypeError(`${path} contains an owner absent from compiler input`)
	}
}

/** Validates one exact, portable contribution attribution. */
export function assertSchemaContributionProvenance(
	value: unknown,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): asserts value is SchemaContributionProvenance {
	if (!isPlainRecord(value)) throw new TypeError(`${path} must be provenance`)
	assertExactKeys(value, contributionKeys, path)
	assertNonEmptyString(value.contributionId, `${path}.contributionId`)
	if (!isPlainRecord(value.normalizedStaticOptions)) {
		throw new TypeError(
			`${path}.normalizedStaticOptions must be portable facts`,
		)
	}
	assertContributionOwner(value.owner, `${path}.owner`, allowedOwners)
	if (
		!Number.isSafeInteger(value.protocolVersion) ||
		Number(value.protocolVersion) < 1
	) {
		throw new TypeError(
			`${path}.protocolVersion must be a positive safe integer`,
		)
	}
}

const assertContributionMap = (
	value: unknown,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): void => {
	if (!isPlainRecord(value))
		throw new TypeError(`${path} must be a provenance map`)
	for (const [name, provenance] of Object.entries(value)) {
		assertSchemaContributionProvenance(
			provenance,
			`${path}.${name}`,
			allowedOwners,
		)
	}
}

/** Validates the independent definition and value attribution of one option. */
export const assertSchemaOptionProvenance = (
	value: unknown,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): void => {
	if (!isPlainRecord(value))
		throw new TypeError(`${path} must be option provenance`)
	assertExactKeys(value, new Set(['definition', 'value']), path)
	assertSchemaContributionProvenance(
		value.definition,
		`${path}.definition`,
		allowedOwners,
	)
	assertSchemaContributionProvenance(
		value.value,
		`${path}.value`,
		allowedOwners,
	)
}

const assertProvenanceList = (
	value: unknown,
	keys: ReadonlySet<string>,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): void => {
	if (!isUnknownArray(value)) throw new TypeError(`${path} must be a list`)
	for (const [index, entry] of value.entries()) {
		const entryPath = `${path}[${String(index)}]`
		if (!isPlainRecord(entry))
			throw new TypeError(`${entryPath} must be provenance`)
		assertExactKeys(entry, keys, entryPath)
		assertSchemaContributionProvenance(
			entry.provenance,
			`${entryPath}.provenance`,
			allowedOwners,
		)
	}
}

/** Validates the complete provenance ledger attached to one schema node. */
export function assertSchemaCompilationProvenance(
	value: unknown,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): asserts value is SchemaCompilationProvenance {
	if (!isPlainRecord(value))
		throw new TypeError(`${path} must be schema provenance`)
	assertExactKeys(value, compilationKeys, path)
	assertSchemaContributionProvenance(
		value.schema,
		`${path}.schema`,
		allowedOwners,
	)
	assertContributionMap(value.fields, `${path}.fields`, allowedOwners)

	if (!isPlainRecord(value.fieldOptions) || !isPlainRecord(value.options)) {
		throw new TypeError(`${path} must contain option provenance maps`)
	}
	for (const [fieldName, options] of Object.entries(value.fieldOptions)) {
		if (!isPlainRecord(options)) {
			throw new TypeError(`${path}.fieldOptions.${fieldName} must be a map`)
		}
		for (const [name, provenance] of Object.entries(options)) {
			assertSchemaOptionProvenance(
				provenance,
				`${path}.fieldOptions.${fieldName}.${name}`,
				allowedOwners,
			)
		}
	}
	for (const [name, provenance] of Object.entries(value.options)) {
		assertSchemaOptionProvenance(
			provenance,
			`${path}.options.${name}`,
			allowedOwners,
		)
	}

	assertProvenanceList(
		value.constraints,
		new Set(['definition', 'provenance']),
		`${path}.constraints`,
		allowedOwners,
	)
	assertProvenanceList(
		value.indexes,
		new Set(['definition', 'provenance']),
		`${path}.indexes`,
		allowedOwners,
	)
	assertProvenanceList(
		value.patches,
		new Set(['kind', 'provenance', 'targetClassName']),
		`${path}.patches`,
		allowedOwners,
	)
}

/** Lists every exact owner identity a compiler is allowed to attribute. */
export const collectCompilationOwnerIdentities = (
	input: Readonly<{
		readonly declarations: readonly Readonly<{
			readonly owner: PluginSchemaContributionOwner
		}>[]
	}>,
): ReadonlySet<string> =>
	new Set([
		'application',
		'core',
		...input.declarations.map(({ owner }) => ownerIdentity(owner)),
	])
