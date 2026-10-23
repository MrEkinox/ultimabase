// `validate(target, schema)` (D-108): a part of the request checked by a
// Standard Schema, which the route reads, typed, as `c.req.valid(target)`.
import type { Env, MiddlewareHandler, ValidationTargets } from 'hono'
import { validator } from 'hono/validator'
import type { Issue } from 'ultimabase'
import { PublicError } from 'ultimabase'

type Segment = PropertyKey | { readonly key: PropertyKey }

/**
 * Standard Schema (standardschema.dev), the part read here. Its
 * specification asks for the interface to be copied, not imported.
 */
export interface StandardSchema {
	readonly '~standard': {
		readonly validate: (value: unknown) => Result | Promise<Result>
		readonly types?: { readonly input: unknown } | undefined
	}
}
type Result =
	| { readonly value: unknown; readonly issues?: undefined }
	| {
			readonly issues: readonly {
				readonly message: string
				readonly path?: readonly Segment[] | undefined
			}[]
	  }

/** What the schema returns for a value it accepts. */
type Output<S extends StandardSchema> = Extract<
	Awaited<ReturnType<S['~standard']['validate']>>,
	{ readonly value: unknown }
>['value']

/** What the schema takes, `unknown` when it declares no types. */
type Input<S extends StandardSchema> = NonNullable<
	S['~standard']['types']
>['input']

/** What a route reads with `c.req.valid(target)`, and a client sends. */
type Validated<T extends keyof ValidationTargets, S extends StandardSchema> = {
	readonly in: {
		readonly [K in T]: K extends 'json' ? Input<S> : NonNullable<Input<S>>
	}
	readonly out: { readonly [K in T]: Output<S> }
}

const keyOf = (segment: Segment): string | number => {
	const key = typeof segment === 'object' ? segment.key : segment
	return typeof key === 'symbol' ? String(key) : key
}

/** Refuses the request with the issues the schema reports, as the kernel does. */
export const validate = <
	T extends keyof ValidationTargets,
	S extends StandardSchema,
>(
	target: T,
	schema: S,
): MiddlewareHandler<Env, string, Validated<T, S>> => {
	const check = async (value: unknown): Promise<unknown> => {
		const result = await schema['~standard'].validate(value)
		if (result.issues === undefined) return result.value
		const issues: Issue[] = result.issues.map((issue) => ({
			path: (issue.path ?? []).map(keyOf),
			message: issue.message,
		}))
		throw new PublicError('VALIDATION_FAILED', 'Invalid data.', {
			details: { issues },
		})
	}
	// Hono infers the value from `check`; the schema gives its type.
	return validator<
		unknown,
		string,
		string,
		T,
		string,
		typeof check,
		Validated<T, S>,
		Env
	>(target, check)
}
