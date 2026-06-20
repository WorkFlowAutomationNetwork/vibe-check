def test_github_settings_present_with_defaults():
    from lib.settings import settings
    # Optional — unset in the test env, so default None
    assert settings.github_app_id is None
    assert settings.github_app_private_key is None
    assert settings.github_api_url == "https://api.github.com"
