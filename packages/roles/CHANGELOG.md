# @ultimabase/roles

## 0.7.0

### Patch Changes

- 1f34e7a: Only Master creates, updates or deletes a role, whatever the role model's `access` allows: any other caller gets `ACCESS_DENIED`, `Role update refused.`, logged with its `callerId`. A client allowed to update roles could rename `Admin` away and its own role to `Admin`, and `hasRole` matches by name. The role model's `access` now decides reads; an admin screen writes roles through a function that writes as Master.
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
  - ultimabase@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [e97378e]
- Updated dependencies [778bbbc]
- Updated dependencies [2bccedd]
- Updated dependencies [f808da8]
- Updated dependencies [7c20553]
- Updated dependencies [2f1baf1]
- Updated dependencies [945b1b3]
- Updated dependencies [4ff9d42]
- Updated dependencies [41b5dca]
- Updated dependencies [703ed93]
- Updated dependencies [76509c3]
- Updated dependencies [a6394ba]
- Updated dependencies [41b5dca]
- Updated dependencies [41b5dca]
- Updated dependencies [ce7e68f]
- Updated dependencies [d6ec5d4]
- Updated dependencies [0a6de4d]
- Updated dependencies [1644bb1]
- Updated dependencies [12edcfd]
- Updated dependencies [a479bca]
- Updated dependencies [0102aa8]
- Updated dependencies [7a8d0d8]
- Updated dependencies [e3d051f]
- Updated dependencies [6140b2b]
- Updated dependencies [0699e37]
  - ultimabase@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [20e2cc5]
- Updated dependencies [efc5f10]
- Updated dependencies [fa67fd3]
- Updated dependencies [3646c66]
- Updated dependencies [9e34dc6]
- Updated dependencies [05cc9ce]
  - ultimabase@0.5.0

## 0.4.0

### Minor Changes

- 69699b2: A relation's other side is named, never found by itself (D-237). A `one`
  without `inverse` stores its key and its target gets no field:
  `author: f.one(() => User)` no longer asks `User` for a `many`. A `many`
  names its other side with `inverse`, which the types require:
  `posts: f.many(() => Post, { inverse: 'author' })`, and both sides of a
  many-to-many name each other. In a one-to-one, the optional side names the
  other and stores no key; the side it names stores the key. The user model of
  `defineRole` lists its roles in
  `roles: f.many(() => Role, { inverse: 'members' })`. GraphQL and OpenAPI give
  a one-sided `one` its target's whole input, `UserCreateNestedOneInput`.
  `StoredRecord` and the types built on it lose their second parameter.

### Patch Changes

- 844627a: A many-to-many written from its other side runs this side's field rule too,
  and only Master gives a role: a user who may edit their own row no longer
  becomes an Admin by connecting `roles` (D-213).
- Updated dependencies [67d5152]
- Updated dependencies [4c2d462]
- Updated dependencies [7accc26]
- Updated dependencies [783fc4b]
- Updated dependencies [f38d1fb]
- Updated dependencies [8dca2cf]
- Updated dependencies [4e1a966]
- Updated dependencies [e4c1252]
- Updated dependencies [11b7633]
- Updated dependencies [6f37f70]
- Updated dependencies [9b491fb]
- Updated dependencies [9b491fb]
- Updated dependencies [b65eb74]
- Updated dependencies [1354efd]
- Updated dependencies [b994e6e]
- Updated dependencies [fb807e1]
- Updated dependencies [69699b2]
- Updated dependencies [4b37376]
- Updated dependencies [d76e882]
- Updated dependencies [ebdf8a0]
- Updated dependencies [b5c22b0]
- Updated dependencies [1d7fda8]
- Updated dependencies [a778695]
- Updated dependencies [adafb1a]
- Updated dependencies [2afc370]
- Updated dependencies [e61e1c2]
- Updated dependencies [844627a]
- Updated dependencies [eb6dbbf]
- Updated dependencies [c9a8228]
- Updated dependencies [501c0cb]
- Updated dependencies [644a24f]
- Updated dependencies [efc4303]
- Updated dependencies [6c1cfe5]
  - ultimabase@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [41cfff6]
- Updated dependencies [7530d07]
- Updated dependencies [6e8ebf6]
- Updated dependencies [760560a]
- Updated dependencies [21b52bc]
- Updated dependencies [134d951]
- Updated dependencies [1195207]
- Updated dependencies [bc4d6de]
- Updated dependencies [9cd2dd4]
- Updated dependencies [f33c16f]
- Updated dependencies [b06627c]
- Updated dependencies [8ce42f6]
- Updated dependencies [b1bc387]
- Updated dependencies [353c2bf]
- Updated dependencies [a7588c3]
- Updated dependencies [aaf123c]
- Updated dependencies [714d3bb]
  - ultimabase@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [2c3bf4e]
- Updated dependencies [fd1263e]
  - ultimabase@0.2.0

## 0.1.2

### Patch Changes

- ultimabase@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies
  - ultimabase@0.1.1

## 0.1.0

### Minor Changes

- 0e885c4: The first release: the kernel, its adapters, transports and plugins, the testing helpers and the starter.

### Patch Changes

- Updated dependencies [0e885c4]
  - ultimabase@0.1.0
