import os

# Set env vars at module load time so pydantic-settings can read them
# before any test module imports lib.settings
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("SCANNER_INTERNAL_KEY", "test-internal-key")
os.environ.setdefault("SCANNER_VERSION", "0.1.0")
os.environ.setdefault("MAX_CONCURRENT_SCANS", "5")

import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_supabase():
    """Patches get_supabase() and returns a mock client."""
    with patch("lib.supabase.get_supabase") as mock_getter:
        client = MagicMock()
        mock_getter.return_value = client
        yield client
