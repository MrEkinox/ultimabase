// Micro-test M (string field DSL) copy of the class-family type model. Targets are
// schema names resolved lazily through the application registry (`Register`).
// It mirrors the public shape of packages/core (field builder callback, pointer and
// relation fields, Prisma-like where/select/include, typed results) without Runtime.
// Public types take the schema value type (`typeof Todo`) so that a class-declared
// schema prints as a short name in hovers and errors. Core never names a plugin.
export {};
