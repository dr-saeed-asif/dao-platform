# Isolated recovery reproduction

Run from dao-platform on a host with the repository dependencies and Docker. The recovery script reads the saved Experiment 1 local snapshot and checks its hash and RPC endpoint fingerprint. Configure that same read-only RPC endpoint privately in the local .env. The script does not use the main PostgreSQL connection. It requires the original block hash to remain available at the pinned height. No signing credentials are loaded into the gateway.

The observed environment was provisioned with these commands. Use a fresh host or an unused, separately configured container name. Existing containers or databases are never reused for a fresh run.

```powershell
$env:POSTGRES_PASSWORD = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
docker run -d --name cyberdao-recovery-m4-01 -e POSTGRES_PASSWORD -e POSTGRES_DB=recovery -p 127.0.0.1::5432 pgvector/pgvector:pg16
Remove-Item Env:POSTGRES_PASSWORD
docker exec cyberdao-recovery-m4-01 createdb -U postgres recovery_fresh
npm run build:packages
npm run build --workspace=api
node research_evaluation/recovery_m4/run.cjs research_evaluation/recovery_m4/run-next
python research_evaluation/recovery_m4/analyze.py research_evaluation/recovery_m4/run-next --out research_evaluation/recovery_m4/results-next
```

The runner advances checkpoints through the existing use case, using batches of 1,000 blocks and a read prefetch window of eight ranges. The projector consumes ranges in order. The immutable event input for the controlled reliability script consists of the two event envelopes in the local run-01 gateway capture. The fixture script creates separate databases in the dedicated container and injects only in-memory inputs. Keep the saved raw captures and SQL exports in controlled storage.

The initial aborted run used the database named recovery. The final runner intentionally selects recovery_fresh and refuses an existing schema. The original M4 snapshot, archived results and first recovery attempt are separate. The final manifest hashes both the raw inputs and reporting outputs. The patched C7 scope is recorded in the source patch and the shared version constant is archived beside it.

The observed run reused previously built workspace packages. The reproduction command rebuilds those packages first. Apply the same source tree, including local C6 and C7 changes, or compare the compiled hashes before execution.
