import type { CreateInput, Model, SchemaRef } from '@ultimabase/core'

import { A, B } from './schema.ts'

// The registry is still read for literal names: these probes must fail.
declare const refB: SchemaRef<'B'>
// @ts-expect-error a SchemaRef of B is not a SchemaRef of A
export const refA: SchemaRef<'A'> = refB
// @ts-expect-error unknown field in a query of the unfinished schema
export const unknownField = A.findMany({ where: { nme: { eq: 'x' } } })
// @ts-expect-error wrong value type in a query of the finished schema
export const wrongValue = B.findMany({ where: { name: { eq: 42 } } })
// @ts-expect-error unknown field in a create input
export const create: CreateInput<'A'> = { nope: 1 }

export const rows: readonly Model<'A'>[] = await A.findMany()
