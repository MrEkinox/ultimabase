import { App, field } from '../../fixture/app.ts'
export class X extends App.Schema('X', { name: field.string() }, {  }) {}
export class Y extends App.Schema('Y', { name: field.string() }, { postgres: { indexes: [{ fields: [''] }] } }) {}
