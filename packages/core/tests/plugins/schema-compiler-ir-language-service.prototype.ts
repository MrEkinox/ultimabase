import {
	isSchemaCompilerArtifactReference,
	schemaCompilerProtocolVersion,
	type SchemaCompilerArtifactReference,
	type /* hover:compiler-input */ SchemaCompilerInput,
	type SchemaCompilerOutput,
} from '../../src/index.js'

declare const compilerInput: SchemaCompilerInput
declare const compilerOutput: SchemaCompilerOutput
declare const artifact: SchemaCompilerArtifactReference<'field'>

const protocol = /* hover:compiler-protocol */ schemaCompilerProtocolVersion
const input = compilerInput
const output = /* hover:compiler-output */ compilerOutput
const reference = /* hover:compiler-artifact */ artifact
const nominal = isSchemaCompilerArtifactReference(reference)

void protocol
void input
void output
void nominal
