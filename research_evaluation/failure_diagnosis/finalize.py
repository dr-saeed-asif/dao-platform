"""Document diagnosis, verify archived hashes, and seal new artifacts. No inference."""
import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DAO = ROOT.parent
AI = DAO.parent / 'api-ai-server1' / 'api-ai-server'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf8')

def main():
    targets = {
        ROOT / 'SPRINGER_EXPERIMENTAL_RESULTS.md': ('SPRINGER_BEFORE_DIAGNOSIS.md', '''# Latest failure diagnosis

Retrospective trace analysis classified all 18 excluded attempts: 16 affected by a pool-adapter protocol defect and two with a direct recorder/dataclass error. Protocol attribution uses source/preflight evidence where wrappers masked exceptions. The usable 32-observation matrix and all 50 raw attempts are preserved.

Among 16 full-workflow observations, eight had routing/source-coverage failures and eight failed the synthesis task-header contract. These categories overlap. Fourteen evidence searches and two count queries completed, with zero retrieval execution errors or provider HTTP/empty-output failures in these records. This does not establish retrieval recall. Two B4 budget-label claims passed the active structural gate despite contradicting returned source rows. Two further B3 claims had verification disabled. The existing scores remain unchanged and the comparison supports exploratory diagnosis only, with unequal decoding/protocols and no independent human adjudication.

A new isolated source-path reproduction confirmed that a failed assignMembers receipt can become CONFIRMED and create an active assignment in in-memory persistence. Read-only SQL inspection found CONFIRMED for the archived reverted transaction. The current legacy SQLite contents lack its matching row. Historical request/import attribution remains unresolved. No production data or behavior was changed, and no model experiment was repeated.

[Failure analysis](failure_diagnosis/FAILURE_ANALYSIS.md) · [Citation support](failure_diagnosis/CITATION_SUPPORT_ERRORS.md) · [Assignment write path](failure_diagnosis/ASSIGNMENT_WRITE_PATH.md) · [Reproduction](failure_diagnosis/README.md)

---

## Preserved pre-diagnosis accounts

'''),
        ROOT / 'springer' / 'EVIDENCE_TO_CLAIMS.md': ('CLAIMS_BEFORE_DIAGNOSIS.md', '''# Current evidence-to-claim update

| Claim | Updated evidence and limits |
|---|---|
| Full orchestration improves answer accuracy | Unsupported by this exploratory sample. Unmatched decoding/protocols, purposive selection and post-hoc AI scoring preclude a causal architecture ranking. |
| Retrieval outages explain the poor full-workflow answers | Unsupported for these 16 observations. Tools completed, while routing missed required sources in eight and the synthesis header contract failed in eight. Categories overlap. |
| Structural citations guarantee factual support | Contradicted. Two B4 budget-category/amount claims passed an active gate despite incorrect relations. Two additional B3 claims occurred with the gate disabled. |
| SQL and chain assignments agree | Contradicted for the investigated orphan. Its linked transaction reverted, yet SQL records CONFIRMED and an active assignment. |
| The exact historical SQL writer is known | Pending. Actual source-path reproduction confirms an unchecked receipt mechanism, not the historical request or import identity. |
| The benchmark is independently human validated | Unsupported. Human adjudication remains pending; 133 reserved unexposed candidates remain preserved. |

[Diagnosis and manuscript wording](../failure_diagnosis/FAILURE_ANALYSIS.md) · [Assignment evidence](../failure_diagnosis/ASSIGNMENT_WRITE_PATH.md)

---

## Preserved earlier mapping

'''),
    }
    for target, (archive_name, prefix) in targets.items():
        archive = HERE / archive_name
        if not archive.exists():
            archive.write_bytes(target.read_bytes())
        target.write_text(prefix + archive.read_text(encoding='utf8'), encoding='utf8')

    checks = []
    # Historical mapping is intentionally updated above, with a byte-preserved copy.
    exceptions = {ROOT / 'springer' / 'EVIDENCE_TO_CLAIMS.md'}
    for folder in ('springer', 'springer_followup', 'springer_history',
                   'exploratory_frozen_v1', 'exploratory_frozen_v2',
                   'benchmark_200/versions/claude_adjudicated_v3'):
        base = ROOT / folder
        manifest = json.loads((base / 'provenance.json').read_text(encoding='utf8'))
        if 'files' in manifest:
            groups = [(base, manifest['files']),
                      (ROOT / 'benchmark_200', manifest.get('outside_version_dependencies', {}))]
        else:
            groups = [(ROOT if folder == 'springer' else base, manifest)]
        for group_base, entries in groups:
            for name, expected in entries.items():
                file = group_base / name
                if not isinstance(expected, str) or len(expected) != 64:
                    raise ValueError('Unexpected provenance schema: ' + folder)
                # Reports were explicitly versioned by prior follow-ups.
                if file in targets:
                    archives = list(HERE.glob('*BEFORE*')) + list(
                        (ROOT / 'springer_followup').glob('*BEFORE*')) + list(
                        (ROOT / 'springer_history').glob('*BEFORE*'))
                    matched = [p for p in archives if sha(p) == expected]
                    if matched:
                        file = matched[0]
                checks.append({'manifest': folder + '/provenance.json', 'file': name,
                               'checked_path': str(file.relative_to(ROOT)),
                               'matches': file.exists() and sha(file) == expected})
    save(HERE / 'preservation_check.json', {
        'checked': len(checks), 'mismatches': [x for x in checks if not x['matches']],
        'intentional_document_updates': [str(p.relative_to(ROOT)) for p in targets],
        'archive_note': 'Prior claim-mapping hash checked against byte-preserved archive.',
        'checks': checks,
    })

    paths = [DAO / p for p in (
        'packages/blockchain-cyberchain/src/cyberchain-governance.gateway.ts',
        'packages/application/src/membership/assign-members.use-case.ts',
        'packages/database/src/postgres-assignment.repository.ts',
        'packages/database/src/postgres-chain-transaction.repository.ts',
        'packages/database/src/migration/reconciler.ts',
        'packages/database/src/migration/validators.ts',
        'packages/database/scripts/import-sqlite.ts',
        'node_modules/@cyberchain/smart-contract-wrapper/dist/contract.js',
        'node_modules/@cyberchain/smart-contract-wrapper/dist/tx.js',
    )] + [AI / ('app/business/agents/' + p) for p in ('synthesis.py', 'quality.py', 'planning.py')]
    save(HERE / 'source_manifest.json', {
        'repository_heads': {label: subprocess.check_output(
            ['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
            for label, repo in [('DAO', DAO), ('AI', AI)]},
        'inspected_file_sha256': {str(p): sha(p) for p in paths},
        'scope': 'Current inspected source. Historical deployment equivalence not established.',
    })
    save(HERE / 'provenance.json', {p.name: sha(p) for p in sorted(HERE.iterdir())
                                  if p.is_file() and p.name != 'provenance.json'})
    print(json.dumps({'archived_hashes_checked': len(checks),
                      'mismatches': sum(not x['matches'] for x in checks)}))

if __name__ == '__main__':
    main()
