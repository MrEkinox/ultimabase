import {
	booleanField,
	dateTimeField,
	FrameworkError,
	stringField,
	type BooleanField,
	type DatabaseMutationOperationAst,
	type DateTimeField,
	type SchemaReference,
	type StringField,
} from '@ultimabase/core'
import {
	addSchemaField,
	contributeSchemaMutation,
	defineOperationValue,
	defineSchemaMutation,
	RequestContextValue,
	type PluginContribution,
	type PluginModelContributionContext,
	type PluginSchemaContributionContext,
	type RequestContext,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { readCreateInputs } from './foundation-routes.js'
import { authUserIdentityOptionName } from './user-identity.js'

/** The typing state of a field only the authentication flows write. */
interface ManagedFieldState<TNullable extends boolean> {
	readonly create: 'forbidden'
	readonly list: false
	readonly nullable: TNullable
	readonly object: 'required'
	readonly update: 'forbidden'
}

/**
 * The User fields the foundation owns when a method signs in by email
 * (ADR-0326, 6.4b amendment): the email, whether it is verified, and since
 * when. Only the authentication flows write them; no create or update input
 * accepts them.
 */
export type AuthEmailFields = Readonly<{
	/** The normalized, unique email the user signs in with. */
	email: StringField<ManagedFieldState<false>>
	/** Whether the current `email` is verified. */
	emailVerified: BooleanField<ManagedFieldState<false>>
	/** When the current `email` was verified, or `null`. */
	emailVerifiedAt: DateTimeField<ManagedFieldState<true>>
}>

/** The names of the email fields the foundation owns. */
export const emailFieldNames: readonly string[] = [
	'email',
	'emailVerified',
	'emailVerifiedAt',
]

/** A User row as the foundation reads it for application callbacks. */
export type AuthUserRecord = Readonly<Record<string, unknown>> &
	Readonly<{ readonly id: string }>

// Only this module holds the marker: the writes it allows are the
// authentication flows' own.
const managedWriteBrand: unique symbol = Symbol('AuthManagedWrite')
interface ManagedWrite {
	readonly [managedWriteBrand]: true
}
const managedWrite: ManagedWrite = Object.freeze({
	[managedWriteBrand]: true as const,
})
const managedWriteValue = new RequestContextValue<
	ManagedWrite,
	'ultimabase.auth.managed-write'
>('ultimabase.auth.managed-write', (value) => {
	if (value !== managedWrite) {
		throw new TypeError('Auth managed writes are package-owned')
	}
	return managedWrite
})

/** Marks a context as the authentication flows' own User writes. */
export const withManagedWrite = (context: RequestContext): RequestContext =>
	context.withValue(managedWriteValue, managedWrite)

/** The values one managed write sets. */
type EmailWriteInput = Readonly<{
	email?: string
	emailVerified?: boolean
	emailVerifiedAt?: string | null
}>

const emailWriteInput = defineOperationValue<EmailWriteInput>((value, path) => {
	if (
		!isPlainRecord(value) ||
		(value.email !== undefined && typeof value.email !== 'string') ||
		(value.emailVerified !== undefined &&
			typeof value.emailVerified !== 'boolean') ||
		(value.emailVerifiedAt !== undefined &&
			value.emailVerifiedAt !== null &&
			typeof value.emailVerifiedAt !== 'string')
	) {
		throw new TypeError(`${path} must be an email write`)
	}
	const { email, emailVerified, emailVerifiedAt } = value
	return immutableRecord({
		...(typeof email === 'string' ? { email } : {}),
		...(typeof emailVerified === 'boolean' ? { emailVerified } : {}),
		...(typeof emailVerifiedAt === 'string' || emailVerifiedAt === null
			? { emailVerifiedAt }
			: {}),
	})
})

// Owned schema mutations are the only writers of forbidden-input fields.
// Master authority keeps it off every transport; the resolver accepts only
// the flows' marked context, so a Master caller cannot desynchronize the
// email from the credentials.
const emailWriteMutation = defineSchemaMutation({
	authority: 'master',
	effect: 'update',
	input: emailWriteInput,
	name: 'ultimabase.auth.write-email',
	returning: 'after',
	version: '1.0.0',
})

/** The User static through which the flows run the managed write. */
const emailWriteStatic = 'ultimabaseAuthWriteEmail'

/** The owned schema mutation that writes the email fields. */
export const emailWriteContribution: PluginContribution =
	contributeSchemaMutation({
		mutation: emailWriteMutation,
		resolve: ({ context, input }) => {
			if (context.getValue(managedWriteValue) === undefined) {
				throw new TypeError(
					'The email fields are written only by the authentication flows',
				)
			}
			return { data: input }
		},
	})

const userSelector = immutableRecord({
	option: immutableRecord({ name: authUserIdentityOptionName }),
	owner: immutableRecord({ kind: 'application' as const }),
})

/** Adds the email fields to the User, with no create or update input. */
export const declareEmailFields = (
	schemas: PluginSchemaContributionContext['schemas'],
): void => {
	schemas.patch({
		operations: [
			// Unique; empty only inside the sign-up transaction that sets it.
			addSchemaField({
				contributionId: 'email',
				field: stringField({ indexed: 'unique' }),
				mutationInput: 'forbidden',
				name: 'email',
			}),
			addSchemaField({
				contributionId: 'email-verified',
				field: booleanField({ default: false, required: true }),
				mutationInput: 'forbidden',
				name: 'emailVerified',
			}),
			addSchemaField({
				contributionId: 'email-verified-at',
				field: dateTimeField(),
				mutationInput: 'forbidden',
				name: 'emailVerifiedAt',
			}),
		],
		targets: schemas.select(userSelector),
	})
}

/** Binds the managed write to the User class. */
export const extendUserWithEmailWrite = ({
	models,
}: PluginModelContributionContext): undefined => {
	models.extend(userSelector, {
		contributionId: 'email-write',
		schemaMutations: {
			[emailWriteStatic]: {
				mutation: emailWriteMutation,
				surfaces: ['schema'],
			},
		},
	})
	return undefined
}

/** Rejects User creation outside the authentication flows, which set the email. */
export const guardUserCreation = (
	operation: DatabaseMutationOperationAst,
	context: RequestContext,
): void => {
	if (
		readCreateInputs(operation).length === 0 ||
		context.getValue(managedWriteValue) !== undefined
	) {
		return
	}
	const message = 'Users are created through sign-up, which sets their email'
	throw new FrameworkError('VALIDATION_ERROR', message, {
		publicMessage: 'The operation input is invalid.',
		publicDetails: {
			issues: [{ code: 'auth.user-creation', message, path: [] }],
		},
	})
}

/** Reads one User row with the plugin's elevation, or `undefined`. */
export const readUserRecord = async (
	user: SchemaReference<string>,
	userId: string,
): Promise<AuthUserRecord | undefined> => {
	const record: unknown = await user.findOne(
		{ where: { id: userId } },
		{ useMasterKey: true },
	)
	if (!isPlainRecord(record) || typeof record.id !== 'string') return undefined
	// A frozen copy whose `id` is typed: the row is plain data.
	return immutableRecord({ ...record, id: record.id })
}

/** Writes the email fields as the authentication flows, with elevation. */
export const writeUserEmailFields = async (
	user: SchemaReference<string>,
	userId: string,
	data: EmailWriteInput,
	context: RequestContext,
): Promise<void> => {
	const write: unknown = Reflect.get(user, emailWriteStatic)
	if (typeof write !== 'function') {
		throw new TypeError('The User email write is not installed')
	}
	await Reflect.apply(write, user, [
		{ id: userId, input: data, select: { id: true } },
		{ context: withManagedWrite(context), useMasterKey: true },
	])
}
