import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


class Settings:
    DB_HOST = os.getenv("SUPABASE_DB_HOST", "localhost")
    DB_PORT = os.getenv("SUPABASE_DB_PORT", "5432")
    DB_NAME = os.getenv("SUPABASE_DB_NAME", "postgres")
    DB_USER = os.getenv("SUPABASE_DB_USER", "postgres")
    DB_PASSWORD = os.getenv("SUPABASE_DB_PASSWORD", "")

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:"
            f"{self.DB_PORT}/{self.DB_NAME}"
        )


settings = Settings()
