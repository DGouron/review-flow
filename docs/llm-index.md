---
title: Documentation Index (LLM Navigation)
---

<!-- This file is designed for LLM agents to quickly locate documentation.
     Human users should use the VitePress site navigation instead. -->

# Documentation Index

Centralized navigation for all review-flow documentation.

## Quick Navigation

| Document | Scope | Description |
|----------|-------|-------------|
| [Quick Start](./guide/quick-start.md) | guide | Get up and running in minutes |
| [Configuration Reference](./reference/config.md) | reference | Server and project config schema |
| [Deployment Guide](./deployment/index.md) | guide | Production deployment with systemd, tunnels |
| [Troubleshooting](./guide/troubleshooting.md) | guide | Common issues and solutions |
| [Review Skills Guide](./guide/review-skills.md) | guide | How to create and customize review skills |
| [Markers Reference](./reference/markers.md) | reference | Text marker syntax for progress and actions |
| [MCP Tools Reference](./reference/mcp-tools.md) | reference | MCP tool parameters, examples, responses |
| [Technical Architecture](./architecture/current.md) | architecture | Current system architecture and file structure |
| [Target Architecture](./architecture/target.md) | architecture | Clean Architecture migration target |
| [MCP Architecture](./architecture/mcp/architecture.md) | architecture | MCP server Clean Architecture design |
| [MCP Specification](./architecture/mcp/specification.md) | spec | MCP review progress specification and status |
| [Ubiquitous Language](./reference/ubiquitous-language.md) | reference | Domain terms, state machines, platform mapping |
| [Project Configuration](./guide/project-config.md) | guide | Per-project `.claude/reviews/config.json` setup |
| [SPEC-003: Skill Templates](./specs/skill-templates.md) | spec | Generic skill template specification |

## Topic Clusters

### Getting Started

1. [Quick Start](./guide/quick-start.md) - Installation and first review
2. [Project Configuration](./guide/project-config.md) - Configure your project
3. [Configuration Reference](./reference/config.md) - Full config schema
4. [Troubleshooting](./guide/troubleshooting.md) - When things go wrong

### Writing Review Skills

1. [Review Skills Guide](./guide/review-skills.md) - Skill structure and best practices
2. [Markers Reference](./reference/markers.md) - Text markers for progress and actions
3. [MCP Tools Reference](./reference/mcp-tools.md) - Structured MCP alternative to markers
4. [SPEC-003: Skill Templates](./specs/skill-templates.md) - Generic templates

### Architecture

1. [Technical Architecture](./architecture/current.md) - Current system overview
2. [Target Architecture](./architecture/target.md) - Clean Architecture migration target
3. [Ubiquitous Language](./reference/ubiquitous-language.md) - Domain vocabulary and state machines

### MCP Server

1. [MCP Specification](./architecture/mcp/specification.md) - Problem, solution, integration
2. [MCP Architecture](./architecture/mcp/architecture.md) - Clean Architecture for MCP
3. [MCP Tools Reference](./reference/mcp-tools.md) - Tool parameters and examples

### Operations

1. [Deployment Guide](./deployment/index.md) - systemd, tunnels, production setup
2. [Troubleshooting](./guide/troubleshooting.md) - Webhooks, services, Claude Code, MCP

## New Contributor Reading Path

Start here if you're new to the project:

1. **[Quick Start](./guide/quick-start.md)** - Understand the basics and run your first review
2. **[Ubiquitous Language](./reference/ubiquitous-language.md)** - Learn the domain vocabulary
3. **[Technical Architecture](./architecture/current.md)** - Understand the current system
4. **[Review Skills Guide](./guide/review-skills.md)** - Learn how skills work
5. **[Configuration Reference](./reference/config.md)** - Understand all configuration options
