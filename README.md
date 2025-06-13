# Remote MCP Server

A Model Context Protocol (MCP) server implementation supporting both modern Streamable HTTP and legacy HTTP+SSE transports, designed for integration with Claude.ai and other MCP-compatible clients.

## Features

- ✅ MCP Protocol Revision 2025-03-26 compliant
- ✅ Streamable HTTP transport (primary)
- ✅ Legacy HTTP+SSE transport (backward compatibility)
- ✅ Basic tools: echo, ping, get_time
- ✅ Docker containerization
- ✅ Health check endpoint
- ✅ CORS support for browser clients

## Prerequisites

- Node.js 20+ (for local development)
- Docker and Docker Compose (for containerized deployment)
- npm or yarn

## Quick Start

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd remote-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Run in development mode:
```bash
npm run dev
```

### Docker Deployment

1. Build and run with Docker Compose:
```bash
# Basic logging (info level)
docker-compose up -d

# Detailed logging (debug level)
LOG_LEVEL=debug docker-compose up -d
```

2. Check server health:
```bash
curl http://localhost:3001/health
```

3. View logs:
```bash
# View logs
docker-compose logs mcp-server

# Follow logs in real-time
docker-compose logs -f mcp-server
```

## API Endpoints

- **POST /mcp** - Modern Streamable HTTP endpoint
- **GET /mcp** - Legacy SSE connection endpoint
- **POST /messages** - Legacy HTTP request endpoint
- **GET /health** - Health check endpoint

## Testing with MCP Inspector

1. Clone MCP Inspector:
```bash
git clone https://github.com/modelcontextprotocol/inspector
cd inspector
npm install
npm run dev
```

2. Connect to server:
   - URL: `http://localhost:3001`
   - Test tools, prompts, and resources

## Available Tools

1. **echo** - Echoes back the provided message
   ```json
   {
     "name": "echo",
     "arguments": {
       "message": "Hello, MCP!"
     }
   }
   ```

2. **ping** - Health check that returns pong with timestamp
   ```json
   {
     "name": "ping",
     "arguments": {}
   }
   ```

3. **get_time** - Returns current server time in various formats
   ```json
   {
     "name": "get_time",
     "arguments": {
       "format": "iso" // or "unix", "readable"
     }
   }
   ```

## Deployment to Synology NAS

1. Export Docker image:
```bash
docker save remote-mcp-server:latest > mcp-server.tar
```

2. Import in Synology Container Manager:
   - Upload the .tar file
   - Create container with port 3001 mapped
   - Configure environment variables

3. Set up Cloudflare tunnel to expose port 3001

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Server port |
| MCP_ENDPOINT | /mcp | Main MCP endpoint |
| ENABLE_LEGACY_TRANSPORT | true | Enable legacy HTTP+SSE support |
| LOG_LEVEL | info | Logging level: `info` (basic), `debug` (detailed) |
| NODE_ENV | development | Environment mode |

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│   Claude.ai     │────▶│  Cloudflare      │
│   MCP Client    │     │  Tunnel          │
└─────────────────┘     └──────────────────┘
                                │
                                ▼
                        ┌──────────────────┐
                        │  MCP Server      │
                        │  Port 3001       │
                        ├──────────────────┤
                        │ • Streamable HTTP│
                        │ • Legacy SSE     │
                        │ • Tools/Prompts  │
                        └──────────────────┘
```

## License

MIT