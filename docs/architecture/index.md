---
title: Architecture
---

# Architecture

Technical architecture documentation for Claude Review Automation, built on Clean Architecture principles with DDD strategic patterns.

## Overview

The system follows a layered architecture inspired by Uncle Bob's Clean Architecture:

- **Entities** — Core business rules, enterprise-wide invariants
- **Use Cases** — Application-specific business orchestration
- **Interface Adapters** — Controllers, presenters, and gateways
- **Frameworks & Drivers** — External tools (Fastify, Claude Code, GitLab/GitHub APIs)

## Documentation

- **[Current Architecture](./current)** — How the system is built today: file structure, component map, data flow
- **[Target Architecture](./target)** — The Clean Architecture migration target with detailed layer definitions

### MCP Server

The MCP (Model Context Protocol) server gives Claude structured tools for review progress tracking:

- **[MCP Specification](./mcp/specification)** — Problem statement, solution design, and integration guide
- **[MCP Architecture](./mcp/architecture)** — Clean Architecture design of the MCP server itself
