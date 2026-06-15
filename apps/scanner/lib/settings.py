from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    redis_url: str = "redis://localhost:6379"
    scanner_internal_key: str
    scanner_version: str = "0.1.0"
    max_concurrent_scans: int = 5

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
