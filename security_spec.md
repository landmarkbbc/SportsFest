# Sports Fest Manager — Security Specification

## 1. Data Invariants
1. **No PII Collected**: Only `name`, `department`, `gender`, `entries`, `team`, `isWalkIn`, `isDemo`, and numeric timestamps are stored. No email, phone, or address fields exist or are permitted by schema validation.
2. **Strict Schema Enforcement**: Every `Game`, `Player`, and `AppSettings` write requires exact allowlisted keys (`hasAll` + `hasOnly`), bounded string lengths, valid enums, and path ID matching `^[a-zA-Z0-9_\-]+$`.
3. **Bounded Player Entries**: A `Player` must have between 1 and 3 entries, and each entry (`entries[0]..entries[2]`) is validated for `slot`, `gameId`, `selfLevel` (1–3), and optional `overrideLevel` (1–3 or null).
4. **Immutable Creation Metadata**: `id` and `createdAt` cannot be modified after document creation.
5. **PIN Hashing**: Admin and Scorer PINs are never stored in plaintext; `settings/app` stores 64-character lowercase SHA-256 hex digests.
6. **Fellowship Access Note**: Viewer mode is intentionally public read-only for church members without requiring Google Login, and role elevation uses the shared device-remembered PIN system defined in the specification. Before deploying publicly outside a trusted church fellowship, consider adding Firebase Authentication checks to write rules.

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Shadow Field Injection on Player**: `{ ..., isAdmin: true }` -> Rejected by `keys().hasOnly(...)`.
2. **Oversized Name DoS**: `{ ..., name: "<500 chars>" }` -> Rejected by `name.size() <= 100`.
3. **Path ID Poisoning**: `/players/bad$id` -> Rejected by `isValidId(playerId)`.
4. **Empty Entries Array**: `{ ..., entries: [] }` -> Rejected by `entries.size() >= 1`.
5. **Over-limit Entries Array**: `{ ..., entries: [e1, e2, e3, e4] }` -> Rejected by `entries.size() <= 3`.
6. **Invalid Skill Level**: `{ ..., entries: [{ slot: "morning", gameId: "chess", selfLevel: 99 }] }` -> Rejected by `selfLevel in [1, 2, 3]`.
7. **Invalid Team Value**: `{ ..., team: "green" }` -> Rejected by `team == null || team in ['blue', 'red']`.
8. **Invalid Department Enum**: `{ ..., department: "Seniors" }` -> Rejected by `department in ['Kids', 'YP', 'SP', 'Adults']`.
9. **Mutating `createdAt` on Update**: `{ createdAt: 1 }` -> Rejected by `incoming().createdAt == existing().createdAt`.
10. **PII / Ghost Key on Game**: `{ id: "x", name: "Tag", type: "team", eligibility: "everyone", email: "a@b.com" }` -> Rejected by `keys().hasOnly(...)`.
11. **Plaintext Short PIN in Settings**: `{ adminPinHash: "1234", ... }` -> Rejected by `adminPinHash.matches('^[a-f0-9]{64}$')`.
12. **Unprotected Catch-All Collection Write**: `/matches/m1` -> Rejected by `match /{document=**} { allow read, write: if false; }`.
