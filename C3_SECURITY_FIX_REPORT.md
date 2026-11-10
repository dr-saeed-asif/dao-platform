# C3 — PostgreSQL credentials in tracked evaluation artifacts

## Root cause and scope

The evaluator persisted credential-bearing PostgreSQL URLs in `.oeval/live-provenance.jsonl` and `.oeval/session.json`. Git tracked both files because `.oeval/` lacked an ignore rule. Both files contained credential-shaped URLs. The observed endpoints include local development URLs. Git exposure and reuse are confirmed. Public reachability, unauthorized use and production reuse were not established.

The scan covered all 49 commits reachable from local refs at inspection time. Both paths occur in the trees of these eight commits:

| Commit | Files present |
|---|---|
| `2cca2c462f01e71e4d5f8b71c9dfe5e4597c4956` | Both |
| `6fbf3641b58489097637d42bf128a814e1e9cc95` | Both |
| `cc9f25da1470814bc09d051e75391e3727981720` | Both |
| `ab992b3d2db96fa9a2c2c3a9e9cbebc1d6a1de7a` | Both |
| `a967659faffdbf9a53afc95c3e63a7dcb665dfaa` | Both |
| `d9df7eb47298e8cb945a9f3bed71e0da103dc740` | Both |
| `214a3605fc33482d92fc20819980efcdb1894ca7` | Both |
| `9f1804c3741f90cc174983d888be54ec15f578a4` | Both |

Reachable affected commits were observed on local `feature/ai-governance-tools` (6), `fix/c1-reverted-receipts` (7) and `fix/c2-production-auth-guards` (8). Cached `origin/feature/ai-governance-tools` (5) and `origin/fix/c2-production-auth-guards` (8) also reach affected commits. No local tags were listed. Hosting-side pull-request refs, forks, caches and other clones were outside the local scan.

## Other tracked matches

A filename-only `git grep` of `HEAD` for credential-bearing PostgreSQL URLs, private-key headers, selected token prefixes and literal secret assignments returned the two evaluation files, `.env.example`, `readme.md` and five API test files. The remaining test matches are fixture candidates. The scan is pattern-based and cannot certify the absence of other secrets.

An exact byte search using credential-bearing URI prefixes extracted privately from the two files found additional copies in `.env.example` (31 commit snapshots), `readme.md` (8) and historical `backend-application/.env.example` (2). A prefix match can span different URL paths. At least one password from the evaluation files also matches the tracked Compose development default and both current local `POSTGRES_URL` configurations. A bare password substring search had false positives and does not establish reuse in every matching file. Keep the example files tracked. Treat shared defaults as public, and do not use them for any database that requires a secret.

## Changes completed

- Staged `/.oeval/` in `.gitignore` and removed the two `.oeval` entries from the index using `git rm -r --cached -- .oeval`. The local files were preserved byte for byte.
- Kept `.env` and `.env.*` rules and the `.env.example` exception. Added ignore rules for `.envrc`, `.pgpass`, `*.pem` and `*.key`, with explicitly named key and certificate example exceptions. The root and web `.env.example` files remain tracked.
- Scope is Git index and ignore rules. Application source, connection settings, Compose configuration and published research records were preserved. The ignore rule blocks ordinary `git add`. Forced adds and other paths remain possible, so review staged names and use a secret scanner before committing.

## History cleanup status and approval gate

The index fix is staged locally. History rewriting and remote publication are pending explicit approval. Removing paths from the current index does not remove old blobs. Path removal alone would leave the additional URI copies described above.

1. Coordinate a write freeze and record authoritative remote branch/tag tips and protection settings. Account for review refs, forks, CI artifacts and releases with the hosting administrator. Commit the current index fix before the approved cleanup, or transfer its patch to the clean clone before publishing.
2. Before rewriting, create a mirror backup and an `--all` Git bundle in access-restricted encrypted storage outside the repositories. Example after approval: `git clone --mirror <approved-remote-url> <private-backup-dir>` and `git -C <private-backup-dir> bundle create <private-backup.bundle> --all`. Verify with `git -C <private-backup-dir> bundle verify <private-backup.bundle>` and record the ref inventory. Preserve unpublished branches separately if required. The backup contains the exposure. Keep it quarantined and out of ordinary remotes, CI and shared storage.
3. Create a separate fresh mirror for the rewrite. Privately prepare a `git-filter-repo` expressions file outside the repository for the confirmed exposed URI/password occurrences outside `.oeval/`. Review exact matches and scope replacements to credential contexts if a short default also occurs in ordinary text. Keep replacement values out of shell arguments, logs and the report. The proposed command in the disposable clone is `git filter-repo --sensitive-data-removal --invert-paths --path .oeval/ --replace-text <restricted-expressions-file>`. A path-aware callback is preferable to an overly broad replacement. Preserve examples with safe placeholders and retain an approved source diff of the changes.
4. In the rewritten clone, confirm the targeted paths have no history using `git log --all -- .oeval/`. Rescan all intended refs for original URLs and confirmed secret assignments without printing matches. Review the commit map, validate every intended branch and tag, and verify checkout and relevant tests before publication. `git-filter-repo` may remove `origin` as a safety measure. Reattach only the approved destination. Publish only approved refs using explicit leases against recorded remote tips. Coordinate any required branch protection changes and hosting-side cache or review-ref cleanup separately.
5. Rewriting changes affected commits and descendant IDs. Rewritten tag targets and signatures can require re-signing. Open reviews and CI references to old IDs can become stale. Collaborators should fresh-clone or transplant reviewed local patches onto rewritten refs and avoid merging old branches back. If publication must be rolled back, restore only explicitly approved refs from the verified bundle. Restoration can republish secret-bearing history and requires separate incident-owner approval. Never restore the compromised password.

## Credential rotation status and verification

Rotation is pending explicit approval. The DAO Nest service reads `POSTGRES_URL`. Its database migration tools also read that key. The Python AI server reads its own `POSTGRES_URL`. Check the actual service environment and secret-store overrides, along with backup, indexing, CI and research jobs that share the affected role. `DATABASE_URL` is a separate application configuration key and should change only if an actual consumer uses it for the affected PostgreSQL role. For local Compose, inspect both repositories for bootstrap credentials. Changing `POSTGRES_PASSWORD` in Compose alone does not change the role password in an initialized data volume.

Use a maintenance window or an approved role migration plan. Generate a unique replacement in the secret manager. Set it through an administrative channel that avoids shell history and command logs, such as interactive `psql` `\password` when approved. Update all authorized consumers with the matching URL-encoded credentials via secret injection and recycle their pools. Verify each service can authenticate and perform a scoped read, and check application health and authorization. Verify a fresh connection with the old password is rejected. Existing sessions may remain active after a password change. Review them and terminate only sessions covered by the approved incident plan. Check access logs for unexpected use. Verify role grants, service health and the removal of temporary credentials before closing the rotation.

## Tests performed and manuscript effect

| Check | Result |
|---|---|
| `git ls-files -- .oeval` before and after | Two tracked entries before, zero after |
| `Get-FileHash` before and after `git rm --cached` | Both local files preserved byte for byte |
| `git check-ignore -v` and `git add --dry-run -- .oeval` | Session path ignored and ordinary add rejected. Environment, password and key paths ignored. |
| `git check-ignore --no-index` on the root and web `.env.example` files | Neither example is ignored |
| `git diff --cached --name-status` and `git diff --cached --check` | Only the ignore edit, two index removals and this report. No application source removed. |
| Read-only PostgreSQL `SELECT 1` using each repository's local `POSTGRES_URL` | Passed for DAO and AI. This verifies connection configuration at check time, not full application health. |

The recorded experiments and their denominators are unchanged. The manuscript may report working-tree containment and confirmed historical exposure. History eradication, credential revocation and production incident impact remain unverified.
