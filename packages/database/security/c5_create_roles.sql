-- DBA bootstrap once per cluster, using fresh names. No credentials are set here.
BEGIN;
CREATE ROLE cyberdao_ai_governance_reader NOLOGIN;
CREATE ROLE cyberdao_ai_data_writer NOLOGIN;
CREATE ROLE cyberdao_ai_runtime LOGIN INHERIT;
CREATE ROLE cyberdao_dao_runtime LOGIN INHERIT;
GRANT cyberdao_ai_governance_reader, cyberdao_ai_data_writer TO cyberdao_ai_runtime
    WITH INHERIT TRUE, SET FALSE;
COMMIT;
