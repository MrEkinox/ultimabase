import {
	canonicalSchemaCompilerTarget,
	isSchemaCompilerArtifactReference,
	replaceSchemaCompiler,
	schemaCompilerCapability,
	schemaCompilerProtocolVersion,
	type SchemaCompilerArtifactReference,
	type /* hover:compiler-input */ SchemaCompilerInput,
	type SchemaCompilerOutput,
	type SchemaCompilerProvenance,
	type /* hover:option-absence-selector */ SchemaOptionAbsenceSelector,
	type /* hover:option-equality-selector */ SchemaOptionEqualitySelector,
	type /* hover:option-presence-selector */ SchemaOptionPresenceSelector,
	type SchemaSelectorOptions,
} from '../../src/index.js'

declare const compilerInput: SchemaCompilerInput
declare const compilerOutput: SchemaCompilerOutput
declare const artifact: SchemaCompilerArtifactReference<'field'>
declare const provenance: SchemaCompilerProvenance
declare const absenceSelector: SchemaOptionAbsenceSelector
declare const presenceSelector: SchemaOptionPresenceSelector
declare const equalitySelector: SchemaOptionEqualitySelector

const protocol = /* hover:compiler-protocol */ schemaCompilerProtocolVersion
const input = compilerInput
const output = /* hover:compiler-output */ compilerOutput
const reference = /* hover:compiler-artifact */ artifact
const nominal = isSchemaCompilerArtifactReference(reference)
const capability = /* hover:compiler-capability */ schemaCompilerCapability
const target = /* hover:compiler-target */ canonicalSchemaCompilerTarget
const selected = /* hover:compiler-provenance */ provenance
const replacement = /* hover:compiler-replacement */ replaceSchemaCompiler({
	compile: (compilerInput) => ({
		protocolVersion: compilerInput.protocolVersion,
		selections: [],
		schemas: compilerInput.schemas,
	}),
	contributionId: 'packed-fixture',
})
const presence: SchemaSelectorOptions = { option: presenceSelector }
const absence: SchemaSelectorOptions = { option: absenceSelector }
const equality: SchemaSelectorOptions = { option: equalitySelector }

void protocol
void input
void output
void nominal
void capability
void target
void selected
void replacement
void presence
void absence
void equality
