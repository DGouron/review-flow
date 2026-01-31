# Frontend CLAUDE.md

## Behavior

Important: Each response will start with "J'ai lu les règles." (I read the rules). This demonstrates you have followed our guidelines.

Always challenge me when relevant and be straightforward without sugarcoating - otherwise it hurts me.

Always evaluate the scope of what's being asked and tell me if it's too broad or vague - otherwise I'll be sad.

Since I'm allergic to technical comments in code, only add them if vital for understanding. This means you've already named functions, files, variables, and folders in a way that screams intent.

## Language Rules

- **Documentation** (`/documents`): French
- **Technical** (code, tests, commits, logs): English

## Documentation References

- **Onboarding**: `/documents/COOKBOOK-ONBOARDING.md` - Getting started guide
- **Architecture**: `/documents/analyses/DDD-CLEAN-ARCHITECTURE-ANALYSE.md` - Architectural analysis
- **Context Mapping**: `/documents/ddd/CONTEXT_MAPPING.md` - Bounded contexts mapping
- **Technical Choices**: `/documents/TECHNICAL-CHOICES.md` - Technical decisions
- **Incidents**: `/documents/incidents/` - Root Cause Analyses (RCA)

## Project Overview

MentorGoal v3 Frontend is an educational platform connecting students, schools, and companies. You can retrieve all package versions in @package.json

## Development Commands

### Essential Commands
```bash
yarn dev                 # Start development server
yarn run check           # Run linting + TypeScript check (run before commits)
yarn typecheck           # TypeScript validation only
yarn run fix             # Auto-fix linting issues

# Testing
yarn test                # Run tests with UI
yarn test:ci             # Run tests in CI mode
yarn coverage            # Generate coverage report

# Building
yarn build:test          # Build for test environment
yarn build:staging       # Build for staging
yarn build:prod          # Build for production
```

### Quality Assurance
Always run `yarn verify` before committing. This runs TypeScript validation, linting, and tests.

## Architecture

- **Style**: Screaming Architecture + Clean Architecture (Uncle Bob)
- **DDD**: Strategic level only (Bounded Contexts, Ubiquitous Language)
- **Modules**: Organized by domain (`src/modules/<domain>/`)
- **Workflow**: Use `/architecture` skill to create components

### Principles

- **Clean Architecture definitions take precedence** over DDD tactical patterns
- **Dependency Rule**: Dependencies point inward only
- **Humble Object Pattern** for Views (zero logic, no React tests)
- **SOLID Principles**: SRP & DIP as pillars

### Key Patterns

- **Gateway Pattern**: All external data access through interfaces
- **Factory Pattern**: Object creation with validation in domain layer
- **Presenter Pattern**: Data transformation for UI components

### Foundation Utilities

**IMPORTANT**: Before creating new utilities, check `src/shared/foundation/` for existing tools:

| Module | Purpose | Usage |
|--------|---------|-------|
| `guard/` | Type-safe validation with Zod | `createGuard(schema, 'context')` |
| `usecase/` | Typed thunks with dependencies | `Usecase<ReturnType>` type |
| `errorBoundary/` | React error boundary utilities | Error recovery, lazy retry |
| `errorReporter/` | Sentry error reporting | `ErrorReporterGateway` |
| `safeJsonParse/` | Safe JSON parsing with error reporting | `SafeJsonParser.parse()` |

Always prefer existing foundation utilities over creating new ones.

### Dependency Injection

Via Redux Toolkit `extraArgument`. Gateways are injected into the store and accessible in thunks:

```typescript
// Configuration in store.ts
const store = configureStore({
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      thunk: {
        extraArgument: { companyGateway, studentGateway, ... }
      }
    })
});

// Usage in a usecase/thunk
export const fetchCompanies = createAsyncThunk(
  'companies/fetch',
  async (_, { extra: { companyGateway } }) => {
    return companyGateway.getAll();
  }
);
```

## Module Development

### Creating New Modules
Follow the established clean architecture pattern:
1. **Domain**: Define types, factories, guards in `src/domain/`
2. **Usecases**: Business logic in `src/modules/[module]/usecases/`
3. **Gateway Interface**: Contracts in `src/modules/[module]/gateway/`
4. **Infrastructure**: API implementation in `src/modules/[module]/gateway-infra/`
5. **Presentation**: Components in `src/containers/[context]/`

## Testing

### Approach: Inside-Out (Detroit School)

**Direction**: Start from Domain, work outward to UI

```
┌───────────────────────────────────────────────────────────────┐
│  Domain  →  Use Cases  →  Interface Adapters  →  Presentation │
│    ↑                                                          │
│  Start here                                                   │
└───────────────────────────────────────────────────────────────┘
```

| Principle | Description |
|-----------|-------------|
| **Test state** | Verify final result, not how we got there |
| **Inside-Out** | Start from domain, work outward |
| **Minimal mocks** | Only for external I/O (gateways, API, DB) |
| **Robust tests** | Resistant to internal refactoring |

- **Framework**: Vitest
- **Absolute Rule**: Never write production code without a failing test first
- **Cycle**: Red → Green → Refactor
- **Interactive Workflow**: Use `/tdd` skill for step-by-step guidance
- **Language**: Tests in **English** (code, descriptions, names)

Reference: https://www.yieldstudio.fr/blog/guide-du-test-driven-development

### Coverage Requirements

Branches 80%, Functions 40%, Lines 30%, Statements 30%

### Test Structure

All tests in `/src/tests/` mirroring source code:

```
/src/tests/
├── units/                    # Unit tests (mirror of /src/)
├── e2e/                      # End-to-end tests (Playwright)
├── factories/                # Factories to create test data
├── helpers/                  # Shared test helpers
├── stubs/                    # Stub gateways for external dependencies
└── mocks/                    # Mock data
```

### Creating a New Test

1. Locate the source file (e.g., `/src/modules/filters/model/filtersWidgets.presenter.ts`)
2. Create test in `/src/tests/units/` with same path + `.test.ts`
3. Use factories from `/src/tests/factories/`
4. Use stubs from `/src/tests/stubs/` for gateways

### Naming Examples
```
Source: /src/domain/spsCvtech/cvtech.guard.ts
Test:   /src/tests/units/domain/spsCvtech/cvtech.guard.test.ts

Source: /src/modules/filters/usecases/fetchFilters.usecase.ts
Test:   /src/tests/units/modules/filters/usecases/fetchFilters.usecase.test.ts
```

### Factories

- **Location**: `/src/tests/factories/`
- **Convention**: `<entity>.factory.ts`
- **Usage**: Always use factories in tests, never hardcoded data

```typescript
// Example: /src/tests/factories/student.factory.ts
export class StudentFactory {
  static createStudent(data?: Partial<StudentType>): StudentType {
    return {
      id: "1",
      firstname: "John",
      lastname: "Doe",
      email: "john.doe@example.com",
      // ... default values
      ...data,  // Override with passed data
    };
  }
}

// Usage in a test
const student = StudentFactory.createStudent({ firstname: "Jane" });
```

## Technology Stack

### Core Technologies
- **React 19** with functional components and hooks
- **TypeScript 5.8.3** with strict configuration
- **Redux Toolkit** with dependency injection for state management
- **TailwindCSS** with custom design system tokens
- **Vite** for build tooling and development server

### React 19 Performance Guidelines

**IMPORTANT**: With React 19, avoid `useMemo` and `useCallback` in most cases.

- React 19's rendering engine is significantly more efficient
- The **React Compiler** (coming soon) will handle memoization automatically
- Manual memoization often adds complexity without measurable benefit
- These hooks should only be used when profiling proves a real performance issue
- **Rule of thumb**: If the memoized function is trivial (< 5 lines), the memoization cost likely exceeds the function recreation cost

```typescript
// ❌ Avoid: Premature optimization
const memoizedValue = useMemo(() => computeValue(a, b), [a, b]);
const memoizedCallback = useCallback(() => doSomething(a), [a]);

// ✅ Prefer: Let React 19 handle it
const value = computeValue(a, b);
const handleClick = () => doSomething(a);
```

**When to consider memoization** (only after profiling):
- Very expensive calculations (>10ms)
- Context providers with many consumers
- Components receiving many props that rarely change together

### Authentication
Multi-provider system supporting Azure MSAL, Okta, and custom SAML with multi-profile capabilities (school, student, company).

### Mobile & PWA
- **Capacitor** for iOS/Android app generation
- PWA capabilities with manifest configuration
- Environment-specific builds for mobile

## Code Quality

### Naming Conventions

- **Full words**: Always use complete words for variables, functions, classes, etc. Never use abbreviations, acronyms, or initialisms.
  - ✅ `quest`, `existing`, `index`, `student`, `company`
  - ❌ `q`, `ex`, `i`, `idx`, `std`, `cpy`

### Frontend-Specific Rules

- **Folders**: camelCase (`designSystem`)
- **React Components (.tsx/.jsx)**: PascalCase (`MyComponent.tsx`, `CompaniesMap.page.tsx`) - for UI components
- **TypeScript files (.ts)**: camelCase (`myFactory.ts`, `companiesStabilizer.service.ts`) - for pure logic
  - **Classes in files**: Even if the class is `PascalCase`, the file name stays camelCase
  - ✅ `safeJsonParser.ts` exports `class SafeJsonParser`
  - ✅ `toggleFiltersTooltip.presenter.ts` exports `class ToggleFiltersTooltipPresenter`
  - ❌ `SafeJsonParser.ts`, `ToggleFiltersTooltipPresenter.ts`
- **Imports**: ALWAYS use aliases `@/` or `@modules/`, NEVER relative paths `../`
  ```typescript
  // ❌ Forbidden
  import { foo } from "../../../entities/foo";
  import { bar } from "../../gateway/bar";

  // ✅ Correct
  import { foo } from "@/modules/myModule/entities/foo";
  import { bar } from "@/modules/myModule/gateway/bar";
  ```
- **Test files**: Located in `/src/tests/` mirroring source structure + `.test.ts` suffix
- **Types**: Capitalized (`User`, `Promotions`) - NO "Type" suffix when using `type`
- **Interfaces**: NO prefix - aligned with Clean Code and ubiquitous language
  - ✅ `UserGateway`, `AuthService`, `StudentRepository`
  - ❌ `IUserGateway`, `IAuthService`, `IStudentRepository`
  - **Cleanup**: When encountering interfaces with "I" prefix in existing code, rename them to remove the prefix
- **Comments**: AVOID systematic comments, prefer self-documenting code
- **JSDoc**: Use for public APIs (this is NOT considered a comment)
- **Type vs Interface**: `type` for data shapes, `interface` for contracts/extending

### Interface Adapters (Anti-Corruption Layer)

**CRITICAL**: In Clean Architecture, the **Interface Adapters** layer bridges Use Cases and the external world. These components are **Anti-Corruption Layers (ACL)** that protect the domain from external details:

```
┌─────────────────────────────────────────────────────────────────┐
│                        External World                           │
│                   (UI, API, Database, etc.)                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    INTERFACE ADAPTERS (ACL)                     │
│            Gateway | Controller | Presenter                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                      Application Layer                          │
│                         (Use Cases)                             │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                       Domain Layer                              │
│                  (Entities, Business Rules)                     │
└─────────────────────────────────────────────────────────────────┘
```

| Adapter | Direction | Responsibility |
|---------|-----------|----------------|
| **Gateway** | External → Domain | Transforms API responses (GraphQL/REST) into domain structures. Isolates usecase from API details. |
| **Controller** | UI → Application | Transforms UI events into usecase calls. Isolates presentation from application. |
| **Presenter** | Domain → UI | Transforms domain data into ViewModels for display. Isolates domain from presentation. |

**Rules**:
- Interface Adapters NEVER contain business logic
- They can transform, validate, and adapt data
- Internal structures (domain) must NEVER leak outside without going through an adapter
- Dependency always points inward (Dependency Rule)

### Bounded Context Communication

**CRITICAL**: Each Bounded Context (school, student, company, shared) is **autonomous**. Communication between BCs must happen **as with an external API**, via gateways.

**Rules**:
- ❌ **Forbidden**: Direct import of components/services from another BC
- ❌ **Forbidden**: Direct access to Redux state of another BC
- ❌ **Forbidden**: `index.ts` barrel export files
- ✅ **Allowed**: Use a **gateway** to communicate with another BC

```typescript
// ❌ Bad: Direct import from another BC
import { fetchCompanyDetails } from '@/containers/school/Companies/usecases/fetchCompanyDetails';
import { companyActions } from '@/containers/school/Companies/store/company.slice';

// ✅ Good: Create a gateway in YOUR BC that exposes needed data
interface ICompanyGateway {
  getCompanyBasicInfo(companyId: string): Promise<CompanyBasicInfo>;
}
```

### Async Patterns

**MANDATORY**: Use `async/await` with `try/catch/finally`. Never use `.then()/.catch()` chains.

```typescript
// ❌ Forbidden: .then() chains
fetchData()
  .then((data) => process(data))
  .then((result) => setResult(result))
  .catch((error) => handleError(error));

// ✅ Correct: async/await with try/catch/finally
const fetchData = async () => {
  try {
    const data = await fetchData();
    const result = await process(data);
    setResult(result);
  } catch (error) {
    handleError(error);
  } finally {
    setIsLoading(false);
  }
};
```

**Rules**:
- Use `Promise.all()` for parallel async operations
- Use `AbortController` for cancellable fetches (cleanup in useEffect)
- Always handle errors with `try/catch`
- Use `finally` for cleanup (loading states, etc.)

### Law of Demeter (Principle of Least Knowledge)

**MANDATORY**: Strictly respect the Law of Demeter.

❌ **Forbidden**: Chaining property/method access
```typescript
user.school.campus.id  // Violation!
order.customer?.address?.city  // Violation (even with optional chaining)!
```

✅ **Correct**: Use getters or selectors
```typescript
user.schoolId  // Derived property
getDeliveryCity(order)  // Selector/helper
```

### Type Assertions (as Type)

**FORBIDDEN**: Type assertions (`as Type`, `as unknown as Type`, `<Type>`) bypass TypeScript's type checking and hide bugs. They are a code smell indicating a design problem.

```typescript
// ❌ Forbidden: Type assertions
const user = response.data as User;
const id = someValue as string;
const result = data as unknown as ExpectedType;

// ❌ Forbidden: Non-null assertions
const element = document.getElementById('app')!;
user.address!.city;
```

✅ **Correct alternatives**:

| Problem | Solution |
|---------|----------|
| API response typing | Use **Guards** with Zod schema validation |
| Unknown data shape | Use **type narrowing** (`if`, `typeof`, `instanceof`) |
| Nullable values | Use **optional chaining** + **nullish coalescing** (`?.`, `??`) |
| Complex transformations | Use **Presenter** pattern with explicit mapping |

```typescript
// ✅ Correct: Guard with Zod validation
const user = userGuard.parse(response.data);

// ✅ Correct: Type narrowing
if (typeof value === 'string') {
  // value is now typed as string
}

// ✅ Correct: Optional chaining + nullish coalescing
const city = user.address?.city ?? 'Unknown';

// ✅ Correct: Explicit null check
const element = document.getElementById('app');
if (!element) throw new Error('App element not found');
```

**If type assertions seem unavoidable**:
1. **STOP** - this indicates a deeper architectural issue
2. Use `/refactoring` skill to plan proper refactoring
3. Common root causes: missing guards, incorrect API types, leaky abstractions

**Legacy code exception**: When encountering existing `as Type` in legacy code that would require significant refactoring, use `/refactoring` skill to create a Mikado graph and plan incremental removal.

## Git Workflow: trunk-based development

### Branch Strategy
- Main branch: `test` (not `main`)
- Feature branches: `MG-XXXX-feature-description`
- Conventional commits with commitlint validation

### Before Committing
1. Run `yarn verify` to validate code quality
2. Ensure tests pass with `yarn test:ci`
3. Follow conventional commit format

### Linting & Formatting
- **Biome.js** for both linting and formatting
- Run `yarn fix` for auto-corrections
- Pre-commit hooks enforce code quality

## Design System

### Atomic Design
Components organized as atoms, molecules, and organisms in `src/designSystem/`. Always use existing design system components before creating new ones.

### TailwindCSS
Custom tokens and responsive design patterns. Check existing utilities before adding custom styles.

## Refactoring

- **Guideline**: https://refactoring.guru/fr/refactoring/smells
- **Techniques**: Mikado and Strangler Pattern
- **Workflow**: Use `/refactoring` skill for large-scale refactoring
- **Focus**: Dead code, unused imports, ubiquitous language, deprecated elements

## Available Skills

### Mandatory Skills (MUST use before coding)

**CRITICAL**: These 3 skills are MANDATORY before writing any production code, no matter what you think :

| Skill | When to use | Why mandatory |
|-------|-------------|---------------|
| `/tdd` | **ALWAYS** before writing/modifying code | No code without failing test first |
| `/architecture` | Creating new components (module, entity, use case, presenter, gateway) | Ensures Clean Architecture compliance |
| `/anti-overengineering` | Before adding patterns, abstractions, or "improvements" | Prevents over-complexity, validates YAGNI |

**Workflow**:
1. `/anti-overengineering` → Challenge if the approach is justified
2. `/architecture` → Design the component structure
3. `/tdd` → Implement with Red-Green-Refactor cycle

### Optional Skills

| Skill | When to use |
|-------|-------------|
| `/react-best-practices` | Writing/reviewing React components, optimizing performance, reducing bundle size |
| `/refactoring` | Migration, library replacement, module splitting |
| `/ddd` | Split domain, define ubiquitous language |
| `/tailwind` | Create/modify UI components, optimize styles |
| `/security` | Scan for secrets before commit, detect tokens and API keys |
| `/solid` | Apply SOLID principles (SRP, OCP, LSP, ISP, DIP) from Clean Architecture |

## Always Flag in Summary

When providing final summaries, explicitly call out:
- 🚨 **Critical architectural issues discovered**
- 🔧 **Solutions implemented to fix inconsistencies**
- ⚠️ **Potential problems that need user attention**
- 📋 **Follow-up actions required**
- 🤔 **Assumptions you had to make**
- 🔍 **Inconsistencies or gaps detected**
- 📝 **Decisions made due to unclear information**
- ✅ **Points that would require validation**
