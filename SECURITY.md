# Security Policy

## Reporting a Vulnerability

**Please DO NOT open a public issue for security vulnerabilities.**

If you discover a security vulnerability, please report it privately using [GitHub's private vulnerability reporting](https://github.com/DGouron/review-flow/security/advisories/new). Include:

1. Description of the vulnerability
2. Steps to reproduce
3. Affected versions
4. Potential impact
5. Any suggested fixes (optional)

We will acknowledge receipt within 48 hours and provide a more detailed response within 7 days.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Security Best Practices

When deploying this application:

1. **Never commit secrets**: Keep `.env` files out of version control
2. **Use strong webhook secrets**: Generate random tokens with at least 32 characters
3. **Restrict network access**: Only expose the webhook endpoint to GitLab/GitHub IPs
4. **Keep dependencies updated**: Run `npm audit` regularly
5. **Use HTTPS**: Always deploy behind a reverse proxy with TLS

## Known Security Considerations

- Webhook signatures are verified using timing-safe comparison to prevent timing attacks
- CLI commands (glab, gh) are executed with proper argument escaping
- No sensitive data is logged in production mode
