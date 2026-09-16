# Changelog

## Unreleased

- Use cached WebSocket transport by default to prevent unnecessary reconnection and replay overhead during long sessions.
- Register the provider as configurable so its models appear in Settings > Models.
- Add an editor action for opening the provider `settings.yaml` from its Settings > Models card.
- Add client registration and composition coverage for the settings integration.
