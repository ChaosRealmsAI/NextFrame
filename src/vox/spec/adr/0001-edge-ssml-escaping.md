# 0001: Edge SSML Escaping Happens In One Place

- Status: Accepted
- Date: 2026-03-19

## Context

Edge synthesis depends on XML SSML requests assembled in `src/backend/edge/ws.rs`. The text path is split across multiple helpers:

- `src/backend/edge/ssml.rs::clean_text` sanitizes unsupported control characters
- `src/backend/edge/ssml.rs::split_text` chunks text according to escaped XML byte cost
- `src/backend/edge/ssml.rs::build_ssml` inserts the text into the `<speak>` payload

If escaping happened both during chunking and during SSML generation, text like `AT&T <tag>` would be transformed twice and the service would receive incorrect content.

## Decision

Escape XML characters only inside `build_ssml` in `src/backend/edge/ssml.rs`.

Supporting rules:

- chunking logic may calculate escaped length
- chunking logic must keep chunk contents unescaped
- `src/backend/edge/ws.rs` must pass raw chunk text to `build_ssml`

## Consequences

- there is one canonical XML-escaping function to audit
- chunk size accounting remains correct for the service byte limit
- tests in `src/backend/edge/ssml.rs` can guard both the single-escape invariant and escaped-length chunking behavior

## Rejected Alternative

Pre-escape text before chunking and treat escaped strings as the transport format.

This was rejected because it couples chunk splitting to XML serialization and makes double-escaping much easier during later refactors.
