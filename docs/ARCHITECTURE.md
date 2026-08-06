<!-- generated-by: groundrules v1.10.0 -->
# Architecture — mcp-freestyle

**Living** snapshot of the current architecture. Updated as the structure evolves.

For the **why** behind choices → see `docs/decisions/`.

## Overview

High-level diagram or paragraph: main components and their relationships.

<!-- Expected shape, to confirm once the data source is decided (ADR pending):

  MCP client (Claude)  ──MCP──▶  mcp-freestyle server  ──▶  sensor data source
                                        │
                                        └─▶ local cache (optional)
-->

## Stack

Not decided yet — candidates: Node/TypeScript (`@modelcontextprotocol/sdk`) or Python (`FastMCP`). Record the choice as an ADR in `docs/decisions/` before writing implementation code.

## Components

### Component A

Role, responsibilities, dependencies.

### Component B

Role, responsibilities, dependencies.

<!-- Components to describe once decided:
     - MCP server / transport (stdio vs HTTP)
     - Sensor data client (auth, fetch, retry)
     - Normalization layer (units, timezones)
     - Cache / storage (see docs/DATA_MODEL.md)
     - Tool surface exposed to the agent
-->

## Main flows

Describe the 2-3 most important flows (auth, read, write...).

<!-- Expected: (1) credential load + authentication, (2) current reading,
     (3) historical window + aggregates. -->

## Environments

- **Local**: ...
- **Staging**: ...
- **Production**: ...

## Points of attention

- Known fragile points
- Current scalability limits
- Major technical debt

<!-- Candidates once the source is chosen: upstream API stability, token expiry,
     rate limits, sensor gaps (warm-up, disconnection) and how they surface to the agent. -->
