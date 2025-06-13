# Remote MCP Server Project

## Project Goals
1. **Primary Goal**: Build and deploy a production-ready remote MCP server that enables Claude.ai to connect and interact with custom tools and resources via a secure Cloudflare tunnel
2. **Infrastructure Goal**: Successfully deploy the server on Synology NAS using Docker Container Manager with reliable uptime and performance
3. **Compatibility Goal**: Ensure full compliance with MCP Protocol Revision 2025-03-26 while maintaining backward compatibility with legacy clients
4. **Security Goal**: Implement OAuth2 with Dynamic Client Registration (Phase 2) to secure server access
5. **Validation Goal**: Pass all MCP Inspector tests and achieve successful Claude.ai integration

## Project Overview
Building a custom remote MCP server that supports both streamable HTTP and SSE transport for various MCP clients, starting with Claude.ai integration. The server will be accessible at https://task.wandermusings.com:3001 through a Cloudflare private tunnel.

## Phase 1: Core MCP Server (Without OAuth)

### Objectives
- Implement MCP Protocol Revision: 2025-03-26 specification
- Support modern Streamable HTTP transport (primary)
- Maintain backward compatibility with deprecated HTTP+SSE transport
- Validate with MCP Inspector tool
- Deploy via Docker to Synology NAS
- Enable Claude.ai connection via Cloudflare tunnel (https://task.wandermusings.com:3001)

### Reference Repository
- Main reference: https://github.com/0Itsuki0/MCPDemo-Typescript-
- Using remote(StreamableHTTP) implementation as base
- ~60-70% of code can be adapted from reference

### Simplified Feature Set

#### Priority 1 (Core Functionality):
- Basic Streamable HTTP transport
- Simple tool execution (echo, ping)
- Connection establishment with Claude.ai
- Legacy transport support (minimal)
- Docker deployment

#### Priority 2 (Deferred):
- Streaming messages/notifications
- Dynamic tool updates
- Complex resource handling
- Advanced session management
- Subscription features

### Implementation Plan

1. **Project Setup (15 mins)**
   - Clone reference repo for code extraction
   - Initialize project with TypeScript
   - Copy core dependencies

2. **Core Implementation (4 hours)**
   - Copy StreamableHTTPServerTransport (90% reuse)
   - Adapt server.ts (80% reuse)
   - Implement 2 basic tools: echo, ping
   - Add minimal legacy HTTP+SSE support

3. **Docker Setup (30 mins)**
   - Simple Dockerfile
   - docker-compose.yml
   - Port 3001 exposure

4. **Validation (1 hour)**
   - Local testing
   - Docker testing
   - MCP Inspector validation
   - Claude.ai connection test

### Technical Stack
- TypeScript/Node.js
- Express.js
- @modelcontextprotocol/sdk
- Docker

### Endpoints
- `/mcp` - Modern Streamable HTTP (POST)
- `/mcp` - Legacy SSE stream (GET)
- `/messages` - Legacy HTTP requests (POST)

## Phase 2: OAuth Integration (Future)
- Dynamic Client Registration
- OAuth 2.1 with PKCE
- JWT token management
- Compliance with MCP authorization spec

## Important Notes
- Focus on minimal viable implementation first
- Validate each step with MCP Inspector
- Ensure Claude.ai compatibility throughout

## CRITICAL DEVELOPMENT REQUIREMENTS (Updated)

### Proper Software Development Practice
- **Git Version Control**: Initialize Git repository from project beginning and track ALL code changes
- **Development Workflow**: Local development → Git tracking → Docker build/test → MCP Inspector validation → Remote Git push → Claude.ai testing
- **Git Push Policy**: Only push to remote GitHub repository AFTER code is ready for MCP Inspector testing (Task 3)

### Docker Deployment Requirement
- **Docker Testing**: Server must be built and tested in Docker environment, not just local development
- **Containerized Validation**: All functionality must work in containerized environment before proceeding to remote deployment

### Testing Limitations & Responsibilities
- **MCP Inspector Testing**: Manual testing by user (Puppeteer MCP not working for automated testing)
- **Claude.ai Testing**: Manual testing by user (assistant cannot configure Claude.ai for real-world testing)
- **Validation Sequence**: Fix server errors → Docker build/test → User tests MCP Inspector → Push to GitHub → User tests Claude.ai

## IMPLEMENTATION COMPLIANCE ANALYSIS

### Article Reference Analysis (levelup.gitconnected.com)
**Source**: https://levelup.gitconnected.com/mcp-server-and-client-with-sse-the-new-streamable-http-d860850d9d9d

#### ✅ **Spec-Compliant Patterns Identified:**
1. **Single Endpoint Structure**: Uses `/mcp` for both POST and GET methods (matches MCP Protocol Specification 2025-03-26)
2. **Session Management**: Proper `mcp-session-id` header handling with transport reuse
3. **GET Method Implementation**: Returns SSE stream or HTTP 405 as required by spec
4. **Initialize Request Detection**: Proper validation using `InitializeRequestSchema.safeParse()`
5. **Transport Response Handling**: Lets `StreamableHTTPServerTransport` manage all response logic

#### ❌ **Current Implementation Issues Identified:**
1. **Multiple Endpoints**: Created separate `/sse` endpoint violating single endpoint requirement
2. **Manual Header Management**: Setting headers manually causes "Cannot write headers after they are sent" error
3. **Response Duplication**: Calling both manual response methods AND `transport.handleRequest()`
4. **Incorrect GET Handler**: Missing session validation and proper early returns

#### 🔧 **Correct Implementation Pattern (from article):**
```typescript
// Single endpoint supporting both methods
router.post('/mcp', async (req, res) => { 
    await server.handlePostRequest(req, res) 
})
router.get('/mcp', async (req, res) => { 
    await server.handleGetRequest(req, res) 
})

// GET handler with proper session management
async handleGetRequest(req: Request, res: Response) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (!sessionId || !this.transports[sessionId]) {
        res.status(400).json(this.createErrorResponse("Bad Request"))
        return  // CRITICAL: Early return prevents header conflicts
    }

    const transport = this.transports[sessionId]
    await transport.handleRequest(req, res)  // No manual headers, no body param
    return
}
```

#### 📋 **Key Compliance Requirements:**
- **No manual SSE header setting** - Transport handles automatically
- **Session-first validation** - Check session ID before processing  
- **Early returns** - Prevent multiple response handling
- **Single endpoint pattern** - `/mcp` only, remove `/sse` endpoint
- **Transport responsibility** - Let SDK handle all HTTP response logic

## Reference Documents and Specifications

### Official MCP Specifications
1. **MCP Protocol Specification (2025-03-26)**
   - URL: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
   - Key sections: Streamable HTTP transport, backward compatibility requirements, security considerations

2. **MCP Authorization Specification**
   - URL: https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization#2-4-dynamic-client-registration
   - Key sections: Dynamic Client Registration, OAuth 2.0 requirements

### Anthropic/Claude.ai Documentation
1. **Building Custom Integrations via Remote MCP Servers**
   - URL: https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers
   - Key points: Claude.ai requirements, supported features, authentication needs

### Implementation References
1. **MCP TypeScript Demo Repository**
   - URL: https://github.com/0Itsuki0/MCPDemo-Typescript-
   - Key directories: remote(StreamableHTTP), HTTP+Auth(RS:AS)
   - Usage: Primary code reference (60-70% reusable)

2. **OAuth2 Server with Dynamic Client Registration**
   - URL: https://github.com/0Itsuki0/OAuth2Server-DynamicClientRegistration
   - Usage: Phase 2 OAuth implementation reference

### Technical Articles and Guides
1. **MCP Server and Client with SSE - The New Streamable HTTP**
   - URL: https://levelup.gitconnected.com/mcp-server-and-client-with-sse-the-new-streamable-http-d860850d9d9d
   - Key insights: Transport evolution, implementation patterns

2. **How to MCP - Complete Guide**
   - URL: https://simplescraper.io/blog/how-to-mcp
   - Key sections: Robustness patterns, error handling, deployment best practices

3. **OAuth2 Server Implementation Guide**
   - URL: https://medium.com/gitconnected/oauth2server-with-dynamic-client-registration-express-typescript-922a6c06802a
   - Usage: Phase 2 implementation guide

### Validation Tools
1. **MCP Inspector**
   - URL: https://github.com/modelcontextprotocol/inspector
   - Purpose: Server validation, compliance testing, feature verification

### Related Documentation
1. **Model Context Protocol Official Site**
   - URL: https://modelcontextprotocol.io/
   - Sections: Core concepts, SDK documentation, roadmap

2. **Cloudflare Remote MCP Servers**
   - URL: https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/
   - Context: Deployment options, scaling considerations

## Git Commit Notes
- **Do Not Include These Lines in Commits**:
  - "🤖 Generated with [Claude Code](https://claude.ai/code)"
  - "Co-Authored-By: Claude <noreply@anthropic.com>"