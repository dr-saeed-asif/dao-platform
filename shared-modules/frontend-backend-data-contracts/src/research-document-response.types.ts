export interface Artefact {
  evidence_id: string;
  filename: string | null;
  media_type: string | null;
  byte_size: string | null;
  computed_hash: string | null;
  verification_status: string;
  lifecycle_state: string;
  uri: string;
}
