# ADR Index

## Accepted

- [0001-edge-ssml-escaping.md](0001-edge-ssml-escaping.md): SSML escaping has one owner, `build_ssml`, to avoid double-escaping and chunk corruption.
- [0002-batch-failure-propagation.md](0002-batch-failure-propagation.md): batch writes a manifest but still exits non-zero on any job failure.
- [0003-multi-backend-architecture.md](0003-multi-backend-architecture.md): backend integration goes through the `Backend` trait and factory instead of command-specific branching.

## Scope

These ADRs describe decisions already embodied in the current code under `src/backend/`, `src/cli/`, and `src/queue/`.
