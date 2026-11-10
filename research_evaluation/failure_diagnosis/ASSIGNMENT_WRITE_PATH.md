# Assignment mismatch: write-path diagnosis

## Established historical observations

The preserved historical scan reconstructs nine assignments and zero unassignments from creation through block 20277566. The contract count is nine. SQL contains ten active distinct members. The extra member has no canonical assignment event through the pin and no latest_evidence link. Its referenced assignMembers transaction reverted at block 19347983, receipt status 0x0, with no logs. The proposal, member and target contract match that failed call. See `../springer_history/assignment_history.json` and `failed_assignment_receipt.json`. These observations establish an unsupported active SQL assignment, not a blockchain fault.

The new read-only SQL inspection found that SQL nevertheless labels that transaction CONFIRMED, operation ASSIGN_MEMBERS, at the reverted block. The extra row's effective_from is 2026-10-18T15:47:07.682Z. A currently available legacy SQLite file does not contain the matching assignment or transaction. This rules out attribution to the inspected current SQLite contents, not to older imports or backups. [Sanitized query output](assignment_write_provenance.json)

## Executable cause compatible with the observations

The HTTP assignment controller invokes AssignMembersUseCase. The use case calls chain.assignMembers, then writes active assignments and records the returned transaction in a database transaction (`packages/application/src/membership/assign-members.use-case.ts:57–68`). The actual Cyberchain gateway's assignMembers method returns confirmedTransaction(result.receipt) without checking receipt.status (`packages/blockchain-cyberchain/src/cyberchain-governance.gateway.ts:109–118`). That helper labels receipts CONFIRMED unconditionally. The installed SDK returns a mined receipt without rejecting status zero. The assignment repository permits a new active row without canonical event evidence, and the transaction repository stores the supplied status. Thus a reverted receipt can be misclassified and persisted by this path. The same unchecked mapper was present in inspected commit 9686c3e, preceding the row timestamp, but historical deployed-binary identity has not been established.

A new isolated reproduction executed the actual current gateway code and existing built AssignMembersUseCase, injecting a failed receipt and in-memory repositories. It produced CONFIRMED and one active assignment row, and did not reject the reverted receipt. It made zero external requests and zero production database writes. This is an explicitly mocked-receipt source-path test, not a live failed transaction or an end-to-end measurement. [Result](assignment_path_reproduction.json) · [Script](reproduce_assignment_path.cjs)

An alternative import path also deserves retention as a hypothesis: import-sqlite.ts preserves missing-event assignments as active, and migration reconciliation can retain legacy no-event rows. Assignment validation filters to rows having latest_evidence_id, omitting this orphan from that check. Canonical event indexing itself requires MemberAssigned/MemberUnassigned events. Neither alternative proves the actual origin of this row.

## Indexing and attribution limits

The current scoped checkpoints are governance-full 20267608 and governance-votes 18898503, both below the archived pin 20277566. This is evidence of incomplete checkpoint coverage at the new observation time, not reconstruction of the SQL state at the historical pin. A delayed index cannot make a reverted transaction successful or supply an assignment event that did not occur. Count semantics alone do not explain the failed-transaction-linked extra row. [Checkpoints](indexer_checkpoint.json)

Catalog inspection found no custom assignment triggers, no configured pgaudit, and no discovered temporal row-history tables among the relevant catalog matches. This inspection does not prove that external server, application or backup logs are unavailable. No historical request/import trace has been recovered. Exact writer attribution therefore remains unresolved, even though an executable defect matching the observed incorrect state is confirmed. [Catalog observations](database_history_availability.json)

## Targeted recommendation

Reject failed receipts before constructing a confirmed transaction, and test that assignment/transaction repositories receive no writes after a failed receipt. Validate the no-event assignment coverage explicitly and examine historical API/import logs before attributing the original write. Such a production fix is recommended but was not applied during this evaluation. Do not alter the historical row, transaction or chain state to force agreement. The prior FINALIZED-to-Closed correction remains intact, and the six winner/tie-data cases remain unverified.
