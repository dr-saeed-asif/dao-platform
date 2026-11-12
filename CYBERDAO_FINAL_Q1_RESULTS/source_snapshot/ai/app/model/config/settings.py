"""Environment-backed settings shared by all application layers."""

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    postgres_url: str
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_chat_model: str = "qwen3.5:4b"
    ollama_fast_model: str = "qwen3.5:4b-instruct"
    ollama_planner_model: str = "qwen3:0.6b"
    ollama_embed_model: str = "qwen3-embedding:0.6b"
    dao_backend_url: str = "http://127.0.0.1:3000"
    dao_backend_token: SecretStr | None = None
    dao_identity_verify_key: str | None = None
    dao_artefact_storage_dir: str | None = None
    agent_concurrency: int = Field(default=1, ge=1, le=8)
    agent_max_retries: int = Field(default=2, ge=1, le=3)
    agent_max_total_time_sec: int = Field(default=300, ge=30, le=1800)
    agent_question_timeout_sec: int = Field(default=120, ge=10, le=600)
    agent_section_group_size: int = Field(default=4, ge=1, le=10)   # tasks composed per progressive synthesis call

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


class RagSettings(Settings):
    rag_dev_token: SecretStr = Field(min_length=24)
    rag_port: int = Field(default=8001, ge=1024, le=65535)


settings = RagSettings()
