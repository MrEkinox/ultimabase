// Keys that carry types only. They never exist at runtime and stay out of
// autocompletion on models and fields.
export declare const modelFields: unique symbol
export declare const fieldType: unique symbol
export declare const declaredRecord: unique symbol
export declare const pluginTypes: unique symbol
/** The codes a plugin's errors may carry, beyond the kernel's (D-206). */
export declare const errorCodes: unique symbol
export declare const readFilter: unique symbol
export declare const typeFields: unique symbol
export declare const nullableOf: unique symbol
export declare const pageOf: unique symbol
/** Marks a calendar day's options, a string compared in order (D-150). */
export declare const calendarDay: unique symbol
/** Marks a field a read rule may hide from a row (D-44). */
export declare const readHidden: unique symbol
/** Marks `allow.public` and `allow.readOnly`, no read rule (D-176). */
export declare const openRead: unique symbol
