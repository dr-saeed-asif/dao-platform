# Versioned workflow correction

## Verified causes and scope

The 18 excluded attempts were caused by research-only pool/recorder adapters, already corrected in exploratory_frozen_v2. Those are harness defects. Their original outputs are preserved and no further harness result was substituted here.

The application trusted legal intent/worker combinations without ensuring explicitly requested sources were represented. Eight saved full-workflow plans omitted required evidence roles. The application also required a TASK header for a single-task answer whose assignment was unambiguous. Eight outputs were rejected for this framing contract. Both defects were reproduced through production functions, independently of pool/recorder adapters.

## Corrected implementation

`planning.py` now adds a source-coverage floor for explicit PDF, stored governance, selected-record metadata and chain requests. It preserves existing semantic routing when no floor is missing, keeps the four-worker bound, and retains role/operator/scope checks. A stored on-chain proposal identifier requests SQL metadata, while a stored-versus-chain status comparison still requires the chain. Proposal search topics do not by themselves trigger live chain reads. This is a narrow lexical guard for explicit source requests, not a general semantic-planning solution. It checks the planned task wording and cannot recover requirements the planner removed during decomposition. Original planner-selected roles may remain, including unnecessary ones. It does not guarantee appropriate subquery selection or answer completeness.

`synthesis.py` permits a nonempty headerless body only for one task. Existing reference and amount checks run afterward. Wrong/duplicate task IDs and ambiguous multi-task bodies remain rejected. No automatic citation was appended and no semantic-support claim was added to the validator. The two B4 budget-label contradictions remain documented findings.

The code is versioned by byte-preserved pre/post source snapshots, base Git revision, SHA-256 manifest and implementation.patch. The new regression file is in the post_fix tree as it is untracked in the source repository. No Git commit, server restart, contract/data change or deployment verification was performed.

## Targeted results

Before correction, the initial 11-method regression suite produced five failure entries, including parameterized subtests. After the fix and a status-comparison edge regression, the final distinct targeted set passed **61 tests**: 12 new regressions, 10 synthesis, 9 routing/ledger, 15 planner, 12 workflow and 3 registry/security tests. Logs preserve all attempts. One legacy planner assertion initially failed because it demanded a governance-only route for an explicitly PDF-sourced question. Its original test is archived; the revised assertion requires the missing evidence role while retaining governance. This is an intentional source-contract change, not a changed gold answer.

Fourteen unique affected saved observations were replayed through production components. Routing and format failures overlap in two observations. Required-source coverage was 0/8 before and 8/8 after the floor. Of eight headerless synthesis outputs, 0/8 were accepted before and 2/8 after. Six still fail citation requirements. All replay versions use an active citation gate, including bodies originating in B3; these checks are not a new B3-versus-B4 ablation. Replay latency is local component execution, not model/API latency. The final routing guard was checked again without redoing synthesis after the status-comparison edge refinement.

No model, SQL, RPC or blockchain transaction was executed by the replay. Original 32 usable observations, all 50 raw attempts, scores and ground truth remain unchanged. The original whole-answer counts must not be replaced with these component pass counts. No human adjudication was added.

## Configuration and remaining gates

The historical model was qwen3:0.6b with recorded digest. B1 had no retrieval, B2 had all 22 registered scope-restricted tools, B3 used full orchestration with the declared verification gates disabled, and B4 kept them active. Saved evidence snapshots matched. However, planner temperature/token limits, writer sampling parameters, prompt protocols and inference opportunities differed. The audit records actual option groups and static role/tool inventories without treating unequal settings as matched.

Component validation passes, but live end-to-end validation of the corrected version and a declared comparable campaign configuration remain pending. Do not resume the old runner into its completed output directory with changed application source. Use a new immutable configuration and output directory, checkpoint only within that version, and run a small live smoke first. Full-benchmark execution remains blocked. The 133 reserved candidates stay untouched. Independent human adjudication remains pending for confirmatory claims. Six uncited replay outputs and semantic budget-support failures are unresolved. Production assignment receipt handling identified earlier was outside this routing/synthesis patch and remains unresolved.

## Reproduction

From the AI repository, use its `.venv/Scripts/python.exe` with that repository on PYTHONPATH. Run unittest discovery for `test_agent_failure_regressions.py`, `test_agent_synthesis.py`, `test_agent_routing_requirements.py`, `test_question_planner.py`, `test_agent_workflow.py` and `test_mcp_registry_security.py`. These tests use fixtures and no live inference. Runtime environment is the installed local project dependencies, not an independently provisioned clean environment.

`replay_smoke.py` loads saved provider output and no gold. Its output is exclusive-create and refuses to overwrite completed evidence. To repeat against another implementation, create a new version/output path. `publish_version.py` derives the baseline audit, archives the corrected source and records the document updates. Existing experiments are not invoked by these scripts. Consult `smoke_replay.jsonl`, `targeted_tests.json`, `baseline_configuration_audit.json`, `implementation_version.json`, `preservation_check.json` and `provenance.json` for provenance.

## Manuscript use

Report a component-level robustness correction and its bounded replay scope. Do not claim improved end-to-end accuracy, causal multi-agent superiority, complete citation support, a human-validated benchmark or a deployed production fix from these tests.
