# Agent Instructions

## General Workflow

This planning workflow applies to substantial features, architectural
changes, or changes with meaningful product ambiguity.

Small, well-defined changes and fixes may be implemented directly
without a formal planning phase unless they reveal a larger product
or architectural decision.

Before implementing work that requires the planning workflow:

1. Read the relevant project documentation, including:
- `docs/PRODUCT.md`
- `docs/DESIGN.md`
- The relevant feature specification under `docs/features/`
- `docs/ARCHITECTURE.md` if it exists
- `docs/PLAN.md` if there is active work

2. Inspect the existing codebase before proposing changes

3. Review the requirements and identify ambiguities, missing decisions, conflicts, or assumptions that materially affect implementation

4. Ask the user about important unresolved product or architectural decisions before proceeding

5. Do not write application code during this planning phase

6. After important questions are resolved, propose an implementation plan that includes:
- Architectural approach
- Major implementation steps
- Files/systems likely to be affected
- Important technical decisions
- Acceptance criteria
- Verification/testing strategy

7. Keep the proposed implementation strictly scoped to the documented requirements.
- Do not anticipate unspecified future features.
- Do not add infrastructure solely for hypothetical future needs.
- Prefer the simplest architecture that satisfies current requirements.

8. Wait for explicit user approval before beginning implementation.

9. Once the plan is approved, write or update `docs/PLAN.md` to reflect the approved implementation plan before beginning implementation.

---

## Implementation

After the implementation plan has been approved:

1. Implement the approved plan in logical milestones.
2. Follow existing architecture and design patterns.
3. Keep `docs/PLAN.md` synchronized with meaningful implementation progress.
4. Run relevant tests and verification after each meaningful milestone.
5. Do not silently deviate from the approved plan when the deviation
   materially affects architecture or product behavior.
6. If a significant unexpected decision arises, stop and ask the user.

---

## Documentation

Project documentation should reflect the current state of the product.

- `PRODUCT.md` describes the overall product and long-lived product behavior.
- `DESIGN.md` describes established design principles and reusable patterns.
- `ARCHITECTURE.md`, when present, describes the current technical architecture.
- Files under `docs/features/` describe requirements for specific features.
- `PLAN.md` describes the current implementation effort.

When implementation changes established product behavior, design patterns,
or architecture, update the relevant documentation.

When documentation conflicts with the actual implementation, investigate
the discrepancy rather than blindly following either source.

---

## Design

When implementing UI:

1. Follow `docs/DESIGN.md`.
2. Follow established patterns in the existing application.
3. Use reasonable modern defaults where the design system is unspecified.
4. Do not create a new visual pattern when an established pattern works.
5. Do not treat unspecified visual details as permanent design decisions.
6. When the user approves a reusable design pattern, update `DESIGN.md`
   when appropriate.

---

## Engineering Principles

- Prefer simple solutions over unnecessary abstraction.
- Do not introduce dependencies without a concrete need.
- Do not build functionality that has not been requested.
- Preserve existing behavior unless the approved plan explicitly changes it.
- Never weaken tests simply to make them pass.
- Verify important behavior rather than assuming generated code works.

---

## Security and Data Safety

- Never expose secrets, API keys, credentials, or tokens in source code.
- Never commit secrets or credentials to version control.
- Prefer least-privilege access to external services.
- Treat documented read-only integrations as strictly read-only.
- Do not perform destructive or externally consequential actions unless
  explicitly required by the approved feature specification.
- Surface security-sensitive architectural decisions during planning.