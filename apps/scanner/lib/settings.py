from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    redis_url: str = "redis://localhost:6379"
    scanner_internal_key: str
    scanner_version: str = "0.1.0"
    max_concurrent_scans: int = 5
    github_app_id: str | None = None
    github_app_private_key: str | None = None
    github_api_url: str = "https://api.github.com"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
