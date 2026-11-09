# Pilot ground truth

The six authored cases in `pilot.json` are a purposive demo sample. Four were selected for the faster model before that run started. Two are simple structured record questions and two are exact document budget questions. `DB3` and `DB4` remain in the dataset for expansion. This is not held-out or representative.

| Item | Ground truth and independent source |
|---|---|
| DB1 | Exact `public.proposals.title`, captured in `../raw_results/gold-postgres.csv`. |
| DB2 | Two rows from `public.votes` for the selected proposal. The same SQL export includes the proposal's cached total separately. |
| DB3 | Ten active assignment rows from `public.proposal_assignments`. |
| DB4 | One proposal row with the selected DAO ID. |
| DOC1 | EUR 12,000, shown on pages 1 and 2 of `CyberGovAI_Pilot_Proposal.pdf`. SHA-256 `b0dd597df1bae8143a6cd399b267023abb5224023744000dca6609e8307a8655`. |
| DOC2 | EUR 4,500, shown on page 1 of `CyberDAO_Community_Training_Proposal.pdf`. SHA-256 `a8f5521bbb01beb375338e9bf225b35c857dc7e68ddfe52ba9e80137619935fa`. |

The PDF amounts were checked by extracting text from the original demo PDFs under the workspace's `output/pdf`, independently of retrieval and generation. IDs identify selected demo proposals; exported facts exclude member addresses. Gold describes the observed source records, with vote counts subject to later changes. Re-export SQL and compare gold before reproducing.

Byte-identical copies of both synthetic source PDFs are included in `source_documents/` for repository reproduction. Their hashes match the values above. The workspace output directory is excluded from Git.
