# Contributing to Claude Review Automation

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn
- Git

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/review-flow.git
   cd review-flow
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy the example configuration:
   ```bash
   cp .env.example .env
   cp config.example.json config.json
   ```
5. Run tests to verify setup:
   ```bash
   npm test
   ```

## Development Workflow

### Running Locally

```bash
npm run dev    # Start with hot reload
npm test       # Run tests in watch mode
npm run build  # Build for production
```

### Code Quality

Before submitting a PR, ensure:

1. **TypeScript compiles**: `npm run typecheck`
2. **Tests pass**: `npm run test:ci`
3. **No linting errors**: Code follows project conventions

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new webhook handler for GitHub Actions
fix: correct signature verification for empty payloads
docs: update deployment guide
refactor: extract platform adapter interface
test: add unit tests for queue service
```

## Pull Request Process

1. **Create a feature branch**:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes** following the coding guidelines

3. **Write tests** for new functionality

4. **Update documentation** if needed

5. **Submit a PR** with a clear description:
   - What does this PR do?
   - Why is this change needed?
   - How was it tested?

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated (if applicable)
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] Commit messages follow conventions

## Architecture Guidelines

This project follows **Clean Architecture** principles:

```
src/
├── entities/           # Domain layer (business logic)
├── usecases/           # Application layer (orchestration)
├── interface-adapters/ # Adapters (controllers, gateways, presenters)
├── main/               # Composition root (DI, server setup)
└── services/           # Infrastructure services
```

### Key Principles

- **Dependency Rule**: Dependencies point inward (outer layers depend on inner)
- **Gateway Pattern**: External access through interfaces
- **No business logic in adapters**: Adapters only transform data

## Testing Guidelines

- Tests are located in `src/tests/` mirroring the source structure
- Use factories from `src/tests/factories/` for test data
- Use stubs from `src/tests/stubs/` for external dependencies
- Write tests in English

### Test Structure

```typescript
describe('MyService', () => {
  describe('when condition', () => {
    it('should expected behavior', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Be respectful and constructive in discussions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
