import {
	createSchemaRecord,
	createSchemaRecords,
	deleteSchemaRecord,
	deleteSchemaRecords,
	updateSchemaRecord,
	updateSchemaRecords,
	upsertSchemaRecord,
	upsertSchemaRecords,
} from '../../query/operations/schema-command-execution.js'
import type {
	SchemaCreateManyExecutionInput,
	SchemaCreateOneExecutionInput,
	SchemaDeleteManyExecutionInput,
	SchemaDeleteOneExecutionInput,
	SchemaUpdateManyExecutionInput,
	SchemaUpdateOneExecutionInput,
	SchemaUpsertManyExecutionInput,
	SchemaUpsertOneExecutionInput,
} from '../../query/operations/schema-commands.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'

/** Names the schema mutations accepted by the application request boundary. */
export type ApplicationSchemaMutationKind =
	| 'create-many'
	| 'create-one'
	| 'delete-many'
	| 'delete-one'
	| 'update-many'
	| 'update-one'
	| 'upsert-many'
	| 'upsert-one'

/** Carries one schema-command input without exposing Runtime or adapter state. */
export type ApplicationSchemaMutationRequest<
	TSchema extends SchemaDefinition = SchemaDefinition,
> =
	| Readonly<{
			kind: 'create-one'
			input: SchemaCreateOneExecutionInput<TSchema>
	  }>
	| Readonly<{
			kind: 'create-many'
			input: SchemaCreateManyExecutionInput<TSchema>
	  }>
	| Readonly<{
			kind: 'update-one'
			input: SchemaUpdateOneExecutionInput<TSchema>
	  }>
	| Readonly<{
			kind: 'update-many'
			input: SchemaUpdateManyExecutionInput<TSchema>
	  }>
	| Readonly<{
			kind: 'upsert-one'
			input: SchemaUpsertOneExecutionInput<TSchema>
	  }>
	| Readonly<{
			kind: 'upsert-many'
			input: SchemaUpsertManyExecutionInput<TSchema>
	  }>
	| Readonly<{
			kind: 'delete-one'
			input: SchemaDeleteOneExecutionInput<TSchema>
	  }>
	| Readonly<{
			kind: 'delete-many'
			input: SchemaDeleteManyExecutionInput<TSchema>
	  }>

/** Maps schema mutation cardinality to the transport-neutral model result. */
export type ApplicationSchemaMutationResult<
	TRequest extends ApplicationSchemaMutationRequest,
> = TRequest['kind'] extends
	'create-many' | 'delete-many' | 'update-many' | 'upsert-many'
	? readonly object[]
	: TRequest['kind'] extends 'delete-one' | 'update-one'
		? object | null
		: object

const schemaMutationRequestKeys = new Set(['input', 'kind'])

const assertSchemaMutationRequest: (
	request: unknown,
) => asserts request is ApplicationSchemaMutationRequest = (request) => {
	assertExactEnumerablePlainObject(
		request,
		schemaMutationRequestKeys,
		'Application schema mutation request must be an object',
		'Application schema mutation request contains unknown key: ',
	)
	if (!Object.hasOwn(request, 'input')) {
		throw new TypeError('Application schema mutation request requires input')
	}
	if (
		typeof request.kind !== 'string' ||
		![
			'create-many',
			'create-one',
			'delete-many',
			'delete-one',
			'update-many',
			'update-one',
			'upsert-many',
			'upsert-one',
		].includes(request.kind)
	) {
		throw new TypeError('Application schema mutation kind is unsupported')
	}
}

/** @internal Delegates one validated request to the canonical schema command. */
export function executeApplicationSchemaMutation<
	const TSchema extends SchemaDefinition,
	const TRequest extends ApplicationSchemaMutationRequest<TSchema>,
>(
	schema: TSchema,
	request: TRequest,
): Promise<ApplicationSchemaMutationResult<TRequest>>
export function executeApplicationSchemaMutation(
	schema: SchemaDefinition,
	request: ApplicationSchemaMutationRequest,
): Promise<object | readonly object[] | null>
export function executeApplicationSchemaMutation(
	schema: SchemaDefinition,
	request: ApplicationSchemaMutationRequest,
): Promise<object | readonly object[] | null> {
	assertSchemaMutationRequest(request)

	switch (request.kind) {
		case 'create-one':
			return createSchemaRecord(schema, request.input)
		case 'create-many':
			return createSchemaRecords(schema, request.input)
		case 'update-one':
			return updateSchemaRecord(schema, request.input)
		case 'update-many':
			return updateSchemaRecords(schema, request.input)
		case 'upsert-one':
			return upsertSchemaRecord(schema, request.input)
		case 'upsert-many':
			return upsertSchemaRecords(schema, request.input)
		case 'delete-one':
			return deleteSchemaRecord(schema, request.input)
		case 'delete-many':
			return deleteSchemaRecords(schema, request.input)
	}
}
