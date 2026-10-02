const Database = require('better-sqlite3');
const db = new Database('./data/dao.db', { readonly: true, fileMustExist: true });

const proposalNulls = db.prepare(\SELECT 
  SUM(CASE WHEN id IS NULL THEN 1 ELSE 0 END) as id_null,
  SUM(CASE WHEN dao_id IS NULL THEN 1 ELSE 0 END) as dao_id_null,
  SUM(CASE WHEN on_chain_id IS NULL THEN 1 ELSE 0 END) as on_chain_id_null,
  SUM(CASE WHEN creator_address IS NULL THEN 1 ELSE 0 END) as creator_null,
  SUM(CASE WHEN status IS NULL THEN 1 ELSE 0 END) as status_null,
  SUM(CASE WHEN metadata_json IS NULL THEN 1 ELSE 0 END) as meta_null
FROM proposals\).get();
console.log('Proposals nulls:', proposalNulls);

const dupKeys = db.prepare(\SELECT idempotency_key, COUNT(*) as cnt FROM proposals GROUP BY idempotency_key HAVING cnt > 1\).all();
console.log('Duplicate idempotency_keys:', dupKeys);

const dupOptions = db.prepare(\SELECT proposal_id, option_index, COUNT(*) as cnt FROM proposal_options GROUP BY proposal_id, option_index HAVING cnt > 1\).all();
console.log('Duplicate proposal_options PK:', dupOptions);

const dupAssign = db.prepare(\SELECT proposal_id, wallet_address, COUNT(*) as cnt FROM proposal_assignments GROUP BY proposal_id, wallet_address HAVING cnt > 1\).all();
console.log('Duplicate proposal_assignments PK:', dupAssign);

const dupVotes = db.prepare(\SELECT transaction_hash, COUNT(*) as cnt FROM votes GROUP BY transaction_hash HAVING cnt > 1\).all();
console.log('Duplicate votes transaction_hash:', dupVotes);

const dupTx = db.prepare(\SELECT transaction_hash, COUNT(*) as cnt FROM chain_transactions GROUP BY transaction_hash HAVING cnt > 1\).all();
console.log('Duplicate chain_transactions PK:', dupTx);

const dupVotePK = db.prepare(\SELECT proposal_id, voter_address, COUNT(*) as cnt FROM votes GROUP BY proposal_id, voter_address HAVING cnt > 1\).all();
console.log('Duplicate votes PK:', dupVotePK);

const dupIndexer = db.prepare(\SELECT indexer_name, COUNT(*) as cnt FROM indexer_state GROUP BY indexer_name HAVING cnt > 1\).all();
console.log('Duplicate indexer_state PK:', dupIndexer);

const pastActive = db.prepare(\SELECT id, status, ends_at FROM proposals WHERE status = 'ACTIVE' AND ends_at < datetime('now')\).all();
console.log('ACTIVE proposals with past ends_at:', pastActive);

const optCounts = db.prepare(\SELECT proposal_id, COUNT(*) as cnt FROM proposal_options GROUP BY proposal_id ORDER BY proposal_id\).all();
console.log('Options per proposal:', optCounts);

const orphanOptions = db.prepare(\SELECT po.* FROM proposal_options po LEFT JOIN proposals p ON po.proposal_id = p.id WHERE p.id IS NULL\).all();
console.log('Orphan proposal_options:', orphanOptions);

const orphanAssign = db.prepare(\SELECT pa.* FROM proposal_assignments pa LEFT JOIN proposals p ON pa.proposal_id = p.id WHERE p.id IS NULL\).all();
console.log('Orphan proposal_assignments:', orphanAssign);

const orphanTx = db.prepare(\SELECT ct.* FROM chain_transactions ct LEFT JOIN proposals p ON ct.proposal_id = p.id WHERE p.id IS NULL\).all();
console.log('Orphan chain_transactions:', orphanTx);

const orphanVotes = db.prepare(\SELECT v.* FROM votes v LEFT JOIN proposals p ON v.proposal_id = p.id WHERE p.id IS NULL\).all();
console.log('Orphan votes:', orphanVotes);
