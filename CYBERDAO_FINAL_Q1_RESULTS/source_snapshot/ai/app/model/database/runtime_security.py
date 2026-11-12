"""Fail closed if a service connection can bypass the C5 database boundary."""

from psycopg import OperationalError

APPROVED_COLUMNS = {
    'proposals': 'id dao_id on_chain_id chain_id contract_address title purpose description status starts_at ends_at total_votes',
    'votes': 'id proposal_id option_index',
    'proposal_assignments': 'proposal_id assigned',
    'proposal_artefacts': 'proposal_id evidence_id',
    'artefacts': 'id evidence_id filename storage_key computed_hash expected_hash hash_algorithm verification_status lifecycle_state media_type byte_size',
}
APPROVED_MEMBERSHIPS = {'cyberdao_ai_governance_reader', 'cyberdao_ai_data_writer'}


async def verify_runtime_role(conn) -> None:
    # A configure callback must leave psycopg's connection idle.
    async with conn.transaction():
        cursor = await conn.execute('''SELECT session_user = 'cyberdao_ai_runtime'
            AND current_user = session_user AND NOT (r.rolsuper OR r.rolcreaterole OR
                r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
            AND NOT pg_has_role(d.datdba, 'MEMBER')
            AND NOT has_database_privilege(d.oid, 'CREATE')
            AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE has_schema_privilege(n.oid, 'CREATE'))
            FROM pg_roles r JOIN pg_database d ON d.datname = current_database()
            WHERE r.rolname = current_user''')
        if not (await cursor.fetchone())[0]:
            raise OperationalError('Unsafe AI database identity or DDL privileges.')
        cursor = await conn.execute('''SELECT rolname,
            rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls
                OR pg_has_role(oid, 'SET') AS unsafe
            FROM pg_roles WHERE rolname <> current_user AND pg_has_role(oid, 'MEMBER')''')
        memberships = dict(await cursor.fetchall())
        if memberships.keys() != APPROVED_MEMBERSHIPS or any(memberships.values()):
            raise OperationalError('Unexpected AI database role memberships.')
        cursor = await conn.execute('''SELECT c.relname, a.attname,
            has_column_privilege(c.oid, a.attnum, 'SELECT')
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')''')
        actual = {(table, column) for table, column, readable in await cursor.fetchall() if readable}
        expected = {(table, column) for table, columns in APPROVED_COLUMNS.items() for column in columns.split()}
        if actual != expected:
            raise OperationalError('AI governance read grants differ from the C5 allowlist.')
        cursor = await conn.execute('''SELECT EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname IN ('public', 'ai') AND pg_has_role(c.relowner, 'MEMBER')
            ) OR EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f') AND (
                has_table_privilege(c.oid, 'DELETE, TRUNCATE, TRIGGER')
                OR has_any_column_privilege(c.oid, 'INSERT, UPDATE, REFERENCES'))
            ) OR EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND has_schema_privilege(n.oid, 'USAGE') AND has_function_privilege(p.oid, 'EXECUTE')
              AND p.oid IS DISTINCT FROM to_regprocedure('ai.is_proposal_member(text,text,text)')
            ) OR NOT EXISTS (
            SELECT 1 FROM pg_class c WHERE c.oid = to_regclass('ai.identity_nonces')
                AND c.relrowsecurity AND NOT pg_has_role(c.relowner, 'MEMBER')
            )''')
        if (await cursor.fetchone())[0]:
            raise OperationalError('AI governance write or replay-storage policy is unsafe.')
