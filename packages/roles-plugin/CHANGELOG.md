# @ultimabase/roles-plugin

## 1.0.0

### Major Changes

- 7f19661: Rename every official plugin package with an explicit `-plugin` suffix so its
  installation role is visible from imports and package metadata.

### Minor Changes

- 3a48ec6: Persist plugin-owned JSON values through versioned portable codecs, store ACLs
  as indexed row-local PostgreSQL JSONB, and resolve role names to stable UUID
  references before persistence.
- b0f865e: Restructure native schema Access declarations around read, create, update,
  upsert, and delete operations, add direct typed row policies, and simplify field
  Access callback inputs and output disclosure naming.
- dc472fc: Use one flat plugin list, add typed definition-based lookup and explicit schema
  claims, align ACL and Roles identities with their package names, register custom
  Password Auth Users at the application root, and export the complete immutable
  Password Auth operation list.
- 47e10e5: Add the immutable ACL grant API, neutral persisted-role reference carriers, and
  precise public IntelliSense for object-level rights.
- b9d2bb9: Enforce persisted object ACLs through native Access constraints, master-only ACL
  management, request-local principal and role resolution, and locked singular
  update input resolution without exposing ACL policy to Core Runtime.

### Patch Changes

- 5abbb7f: Publish focused immutable plugin-authoring helpers and migrate official plugins
  to the shared package manifest and options boundaries without behavior changes.
- ce42766: Publish the public plugin conformance harness with exact failure contracts,
  automatic lifecycle cleanup, optional Typegen and domain checks, and adoption
  across the official plugin packages.
- 65d47ee: Replace the two schema-specialization construction paths with the single typed
  `Schema.defineSpecialized()` boundary and migrate Password User and Role schema
  factories without changing their application-facing contracts.
- 82dc312: Consolidate Schema, Query, Access, application orchestration, and Runtime under
  the single `@ultimabase/core` public entry point. Official plugins now depend on
  that cohesive foundational package instead of synchronized internal packages.
- 1ff75ac: Keep relation handles out of Access-narrowed row projections, make policy-owned
  master bypass explicit, and preserve standalone role notifications plus
  recursion-free ACL-protected role schemas.
- fcf1a72: Add trusted optional and required committed-event contracts, preserving required
  delivery for legacy string emissions while allowing ACL and role notifications
  to run without synthetic consumers.
- Updated dependencies [f4baae2]
- Updated dependencies [4d9cfbf]
- Updated dependencies [2d89051]
- Updated dependencies [629948d]
- Updated dependencies [7d01386]
- Updated dependencies [206bec5]
- Updated dependencies [5abbb7f]
- Updated dependencies [fa5fe82]
- Updated dependencies [87bdad1]
- Updated dependencies [c7f1d33]
- Updated dependencies [74dc247]
- Updated dependencies [4d63866]
- Updated dependencies [c57b835]
- Updated dependencies [ac7554f]
- Updated dependencies [235040c]
- Updated dependencies [9db27e7]
- Updated dependencies [64e22b0]
- Updated dependencies [abd708e]
- Updated dependencies [65b5c66]
- Updated dependencies [9315355]
- Updated dependencies [84a0186]
- Updated dependencies [56024ac]
- Updated dependencies [54e784c]
- Updated dependencies [3a48ec6]
- Updated dependencies [7f569ec]
- Updated dependencies [4d24000]
- Updated dependencies [0eacd98]
- Updated dependencies [1806b81]
- Updated dependencies [aec4cd0]
- Updated dependencies [331a76b]
- Updated dependencies [76b676e]
- Updated dependencies [462a850]
- Updated dependencies [a2b1717]
- Updated dependencies [a6aa8da]
- Updated dependencies [32767cf]
- Updated dependencies [4bab922]
- Updated dependencies [13b797f]
- Updated dependencies [716634d]
- Updated dependencies [114d5a1]
- Updated dependencies [7aac6de]
- Updated dependencies [1850f1c]
- Updated dependencies [e21fffc]
- Updated dependencies [e029de6]
- Updated dependencies [65d47ee]
- Updated dependencies [d8362f0]
- Updated dependencies [571f4bc]
- Updated dependencies [206bec5]
- Updated dependencies [b8cbf6e]
- Updated dependencies [6f9f2e1]
- Updated dependencies [deef6c3]
- Updated dependencies [42e65b6]
- Updated dependencies [41e0fbb]
- Updated dependencies [0977e8d]
- Updated dependencies [b0f865e]
- Updated dependencies [222377f]
- Updated dependencies [760353e]
- Updated dependencies [2f6e99c]
- Updated dependencies [82dc312]
- Updated dependencies [684aa4b]
- Updated dependencies [d3e1a24]
- Updated dependencies [0c03b5b]
- Updated dependencies [0fc8343]
- Updated dependencies [a217e52]
- Updated dependencies [82b71fc]
- Updated dependencies [6115be0]
- Updated dependencies [849ac30]
- Updated dependencies [9af9e98]
- Updated dependencies [30920cc]
- Updated dependencies [76f691d]
- Updated dependencies [dc472fc]
- Updated dependencies [2642045]
- Updated dependencies [9ca5850]
- Updated dependencies [aa06563]
- Updated dependencies [47e10e5]
- Updated dependencies [de8698c]
- Updated dependencies [2635caa]
- Updated dependencies [7d78026]
- Updated dependencies [1dfd965]
- Updated dependencies [ac75b10]
- Updated dependencies [92969f9]
- Updated dependencies [190f5b2]
- Updated dependencies [206bec5]
- Updated dependencies [e4f93e3]
- Updated dependencies [74b91d6]
- Updated dependencies [86c2d06]
- Updated dependencies [1b08f1c]
- Updated dependencies [b11c11f]
- Updated dependencies [fd1a7fd]
- Updated dependencies [79487b0]
- Updated dependencies [e22a540]
- Updated dependencies [9c4139e]
- Updated dependencies [b872410]
- Updated dependencies [fffc6c8]
- Updated dependencies [4978621]
- Updated dependencies [b9b406c]
- Updated dependencies [753dc67]
- Updated dependencies [8c799af]
- Updated dependencies [143502f]
- Updated dependencies [e1f4c66]
- Updated dependencies [eba2dcf]
- Updated dependencies [740d586]
- Updated dependencies [25a4525]
- Updated dependencies [1ff75ac]
- Updated dependencies [a34e05a]
- Updated dependencies [c6c88c3]
- Updated dependencies [ed1192b]
- Updated dependencies [829cf82]
- Updated dependencies [fcf1a72]
- Updated dependencies [1cb87a3]
- Updated dependencies [6681117]
- Updated dependencies [f1c0d67]
- Updated dependencies [c7f1d33]
- Updated dependencies [5e8d4e2]
- Updated dependencies [552985c]
- Updated dependencies [f946761]
- Updated dependencies [fa7148f]
- Updated dependencies [1f7b08a]
- Updated dependencies [198ee97]
- Updated dependencies [1e28819]
- Updated dependencies [e46bcce]
- Updated dependencies [e133642]
- Updated dependencies [b9d2bb9]
- Updated dependencies [396e4f4]
- Updated dependencies [d883791]
- Updated dependencies [9f70dbf]
- Updated dependencies [61def14]
- Updated dependencies [76cf66b]
- Updated dependencies [07f07ef]
- Updated dependencies [aebad56]
- Updated dependencies [8505935]
- Updated dependencies [6aa2103]
- Updated dependencies [a6c75bb]
- Updated dependencies [206bec5]
- Updated dependencies [f9b3922]
- Updated dependencies [e840865]
- Updated dependencies [692ac5a]
- Updated dependencies [815b791]
- Updated dependencies [6dca6fc]
- Updated dependencies [9b9c9db]
- Updated dependencies [33d464d]
- Updated dependencies [cc12678]
  - @ultimabase/core@1.0.0
  - @ultimabase/plugin-kit@0.1.0
  - @ultimabase/shared@1.0.0
  - @ultimabase/access-plugin@1.0.0
