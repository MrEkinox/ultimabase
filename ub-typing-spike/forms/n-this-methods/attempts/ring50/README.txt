Ring of 50 generated schemas (gen.mjs 50) in form N, loose rules (void returns).
base     : current lib -> TS2589 x17 + TS2322 x50 (registration). Same from 25 schemas up (15 and 20 compile).
nocross  : base without the cross-schema `update()` filter -> 0 errors.
v1       : lib without the retained declaration parameter -> same failure.
v2       : lib without shape params / NoExtraKeys / retention -> same TS2589.
v3       : minimal define (declaration & loose rules) -> same TS2589.
Conclusion: the bodies of context-sensitive rule methods are typed while the schema constant is
typed (return type inferred from the body during contextual checking, even if the target return
is void), so each schema's type pulls the next one along the relation chain: depth grows with
the chain length until TS2589.
