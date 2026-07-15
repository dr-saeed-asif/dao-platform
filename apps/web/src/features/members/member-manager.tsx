"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { daoApi } from "@/lib/api/client";
import type { Assignment, Proposal } from "@/lib/api/types";
import { useWallet } from "@/features/wallet/wallet-provider";

export function MemberManager({ proposal }: { proposal: Proposal }) {
  const { address } = useWallet();
  const [members, setMembers] = useState<Assignment[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(
    async () => setMembers(await daoApi.listMembers(proposal.id)),
    [proposal.id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return setMessage("Connect the administrator wallet first.");
    const form = event.currentTarget;
    const member = String(new FormData(form).get("member")).trim();
    try {
      setMessage("Submitting assignment on-chain…");
      await daoApi.assignMembers(proposal.id, [member], address);
      form.reset();
      await load();
      setMessage("Member assigned and indexed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Assignment failed.");
    }
  }
  async function remove(member: string) {
    if (!address) return setMessage("Connect the administrator wallet first.");
    try {
      await daoApi.unassignMember(proposal.id, member, address);
      await load();
      setMessage("Member removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Removal failed.");
    }
  }
  return (
    <div className="workflow-card">
      <div className="card-title">
        <div>
          <span className="eyebrow">Eligibility</span>
          <h3>Voting members</h3>
        </div>
        <span className="count">{members.length}</span>
      </div>
      <form className="inline-form" onSubmit={assign}>
        <input
          name="member"
          placeholder="0x member wallet"
          pattern="0x[0-9a-fA-F]{40}"
          required
        />
        <button className="button button-secondary">Add member</button>
      </form>
      <div className="member-list">
        {members.length ? (
          members.map((member) => (
            <div className="member-row" key={member.walletAddress}>
              <code>{member.walletAddress}</code>
              <button
                onClick={() => void remove(member.walletAddress)}
                aria-label="Remove member"
              >
                Remove
              </button>
            </div>
          ))
        ) : (
          <p className="empty">No members assigned yet.</p>
        )}
      </div>
      {message && <p className="form-message">{message}</p>}
    </div>
  );
}
