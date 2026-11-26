# Security policy

## Supported versions

Security fixes are made on `main` and shipped in the next release. Only the
latest release receives fixes.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Earlier releases, including STOA 5.9.7 and older packages | No |

## Reporting a vulnerability

**Please do not report security vulnerabilities in public issues, pull
requests, or discussions.**

Report them privately through GitHub:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe the issue, the affected edition (Web, Portable, macOS or Windows
   Desktop) and version, and the steps or files needed to reproduce it.

If you cannot use GitHub's private reporting, contact the maintainer,
[@SameDestination](https://github.com/SameDestination), through the contact
details on their GitHub profile, and ask for a private channel. Do not include
exploit details in your first message.

You can expect an acknowledgement within 7 days. Once the issue is confirmed,
the maintainer will work on a fix, agree a disclosure date with you, and credit
you in the release notes unless you prefer to stay anonymous.

## Scope

Reports are especially welcome for:

- **Network access.** STOA does not connect to AI services or any other
  remote server; you copy prompts to an AI service yourself. Any way to make
  STOA send document content over the network is in scope.
- **Electron isolation.** For example, bypassing `contextIsolation`, the
  renderer sandbox, the `stoaDesktopDocuments` preload bridge or the
  `stoa://app/` protocol's path checks. See
  [`desktop/README.md`](desktop/README.md#security-boundary).
- **Untrusted input.** Malicious `.stoa.json` projects, AI analysis JSON,
  imported fonts, or MDict (`.mdx`/`.mdd`) dictionaries that cause code
  execution, file access outside the intended scope, or data loss.
- **Exports.** Injection through LaTeX, PDF or PNG export.
- **The Portable launcher** (`standalone/portable/`) and its local HTTP server.

Out of scope:

- The accuracy of AI-generated analyses or translations. Please report those
  as ordinary issues.
- Vulnerabilities in third-party AI services themselves.
- Issues that require an already compromised device or account.
- Missing code signing or notarization on Desktop installers. This is a known
  limitation, documented in the README.
