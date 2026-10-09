# Canonical STOA 4.1.1 projects

These are immutable copies of the real-world Ancient Greek and Latin projects
provided for the STOA 5.1 compatibility baseline. Tests verify the exact file
hashes before using them for schema and round-trip checks.

| File | SHA-256 |
| --- | --- |
| `stoa-ancient-greek-20260819-184926.stoa.json` | `fd624656f743918b97d02647a2fe6e7999450af59099a0d4089f053e82faf7d7` |
| `stoa-latin-20260819-191723.stoa.json` | `7802402362f917d442d566ba1f19da22d098eb8d665bc958c263d8cd06110ce7` |

Do not rewrite, reformat, or normalize these JSON files. Add new fixtures under
a different filename when a later schema version needs its own baseline.

## Schema-v2 test strategy

Schema v2 is derived in tests through the explicit v1 → v2 migration rather
than by rewriting either canonical fixture. Its style contract is:

- `document.settings.tokenStyle.layers`: complete defaults for `source`,
  `gloss`, `lemma`, `pos`, and `morphology`;
- `document.settings.tokenStyle.gapAfterPx`: complete defaults for the gap
  after the visible `source`, `gloss`, `lemma`, and `pos` layers;
- `token.styleOverrides`: sparse layer and gap differences only.

The codec tests cover v1 exact semantic round-tripping, stable token IDs/order,
explicit migration, v2 round-tripping, duplicate IDs, and unknown nested fields
at each new style location.
