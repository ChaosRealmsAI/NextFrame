# v0.10.0 Collaboration Retro

## Principle Candidate · A visible editor needs a machine-visible editor

This version showed that "PM can edit it" and "AI can verify it" are the same requirement in practice. The UI looked close, but verification broke until timeline rows, inspector fields, and composition patching had stable `data-*` selectors and CLI state access.

Candidate principle:

> Any direct-manipulation UI should expose the same semantic operation to machines; otherwise every future edit feature becomes visual guesswork.

This is a candidate, not yet promoted to the global collab-patterns library. It overlaps with M-3 (transparent long chains) and M-8 (AI-facing interfaces), but the product-editor angle is sharper.
