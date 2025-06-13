import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

// Load environment variables
dotenv.config();

// Logging configuration
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

function log(level: 'info' | 'debug' | 'error', category: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  
  if (level === 'error' || LOG_LEVEL === 'debug' || (LOG_LEVEL === 'info' && level === 'info')) {
    const logMessage = data 
      ? `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message} ${JSON.stringify(data, null, 2)}` 
      : `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}`;
    
    if (level === 'error') {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
    process.stdout.write(''); // Force flush
  }
}

// Store active transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
const servers: { [sessionId: string]: Server } = {};

// Tool definitions
const TOOLS = {
  echo: {
    name: 'echo',
    description: 'Echoes back the provided message',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to echo back'
        }
      },
      required: ['message']
    }
  },
  ping: {
    name: 'ping',
    description: 'Health check tool that returns pong',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  get_time: {
    name: 'get_time',
    description: 'Returns the current server time',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description: 'Time format: iso, unix, or readable',
          enum: ['iso', 'unix', 'readable']
        }
      }
    }
  }
};

// Prompt definitions
const PROMPTS = [
  {
    name: 'greeting',
    description: 'Generate a greeting message',
    arguments: [
      {
        name: 'name',
        description: 'Name of the person to greet',
        required: false
      }
    ]
  },
  {
    name: 'test_prompt',
    description: 'A simple test prompt for validation',
    arguments: []
  }
];

// Resource definitions
const RESOURCES = [
  {
    uri: 'mcp://server/info',
    name: 'Server Information',
    description: 'Basic information about this MCP server',
    mimeType: 'text/plain'
  },
  {
    uri: 'mcp://server/status',
    name: 'Server Status',
    description: 'Current server status and statistics',
    mimeType: 'application/json'
  }
];

// Helper function to check if request is an initialize request
function isInitializeRequest(body: any): boolean {
  if (!body) return false;
  
  // Check single request
  if (body.method === 'initialize') return true;
  
  // Check batch request
  if (Array.isArray(body)) {
    return body.some(req => req.method === 'initialize');
  }
  
  return false;
}


// Create a new MCP server instance with handlers
function createMCPServer() {
  const server = new Server(
    {
      name: 'remote-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {}
      }
    }
  );

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: Object.values(TOOLS)
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'echo':
        return {
          content: [
            {
              type: 'text',
              text: args?.message || 'Hello from MCP Server!'
            }
          ]
        };

      case 'ping':
        return {
          content: [
            {
              type: 'text',
              text: `pong - ${new Date().toISOString()}`
            }
          ]
        };

      case 'get_time':
        const now = new Date();
        let timeString: string;

        switch (args?.format) {
          case 'unix':
            timeString = Math.floor(now.getTime() / 1000).toString();
            break;
          case 'readable':
            timeString = now.toLocaleString();
            break;
          case 'iso':
          default:
            timeString = now.toISOString();
        }

        return {
          content: [
            {
              type: 'text',
              text: timeString
            }
          ]
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // Register prompt handlers
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: PROMPTS
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const prompt = PROMPTS.find(p => p.name === request.params.name);
    if (!prompt) {
      throw new Error(`Unknown prompt: ${request.params.name}`);
    }

    let message = `Please provide a ${prompt.name}`;
    if (request.params.arguments?.name) {
      message = `Hello, ${request.params.arguments.name}! Welcome to the MCP Server.`;
    }

    return {
      description: prompt.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: message
          }
        }
      ]
    };
  });

  // Register resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: RESOURCES
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const port = process.env.PORT || 3001;
    const endpoint = process.env.MCP_ENDPOINT || '/mcp';

    switch (uri) {
      case 'mcp://server/info':
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `MCP Server v1.0.0
Name: remote-mcp-server
Transport: Streamable HTTP
Port: ${port}
Endpoint: ${endpoint}
Active Sessions: ${Object.keys(transports).length}`
            }
          ]
        };

      case 'mcp://server/status':
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                status: 'running',
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                activeSessions: Object.keys(transports).length,
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ]
        };

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  });

  return server;
}

// Helper function to create error response
function createErrorResponse(message: string, id: any = null) {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message
    },
    id
  };
}

// Create MCP server wrapper class
class MCPServerWrapper {
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  private servers: { [sessionId: string]: Server } = {};

  async handlePostRequest(req: express.Request, res: express.Response) {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const requestBody = req.body;
      
      log('debug', 'HTTP-POST', `Incoming request - SessionId: ${sessionId || 'none'}`, {
        method: requestBody?.method,
        headers: req.headers,
        bodyKeys: Object.keys(requestBody || {})
      });

      // Check if this is an initialize request
      if (isInitializeRequest(requestBody)) {
        log('info', 'INIT', 'Processing initialize request');
        
        // Initialize requests should not have a session ID
        if (sessionId) {
          log('error', 'INIT-ERROR', 'Initialize request includes session ID (invalid)');
          res.status(400).json(this.createErrorResponse("Initialize request must not include session ID"));
          return;
        }

        // Create new transport and server for this session
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: false
        });

        const server = createMCPServer();
        await server.connect(transport);

        log('debug', 'INIT', 'Transport and server created, handling request...');
        
        // Handle the initialize request (this will generate the session ID)
        await transport.handleRequest(req, res, requestBody);

        // Store transport and server by session ID
        if (transport.sessionId) {
          this.transports[transport.sessionId] = transport;
          this.servers[transport.sessionId] = server;
          log('info', 'SESSION', `New session created: ${transport.sessionId}`, {
            totalSessions: Object.keys(this.transports).length
          });
        }
      } else {
        log('debug', 'REQUEST', `Processing non-init request for session: ${sessionId}`);
        
        // Non-initialize requests must have a session ID
        if (!sessionId) {
          log('error', 'REQUEST-ERROR', 'Missing session ID for non-init request');
          res.status(400).json(this.createErrorResponse("Mcp-Session-Id header is required"));
          return;
        }

        // Find existing transport
        const transport = this.transports[sessionId];
        if (!transport) {
          log('error', 'REQUEST-ERROR', `Session not found: ${sessionId}`, {
            availableSessions: Object.keys(this.transports)
          });
          res.status(404).json(this.createErrorResponse("Session not found"));
          return;
        }

        log('debug', 'REQUEST', `Forwarding to transport for session: ${sessionId}`);
        // Handle request with existing transport
        await transport.handleRequest(req, res, requestBody);
      }
    } catch (error) {
      log('error', 'ERROR', 'Error handling POST request', { 
        error: error instanceof Error ? error.message : String(error), 
        stack: error instanceof Error ? error.stack : undefined 
      });
      if (!res.headersSent) {
        res.status(500).json(this.createErrorResponse("Internal error"));
      }
    }
  }

  async handleGetRequest(req: express.Request, res: express.Response) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    
    if (!sessionId || !this.transports[sessionId]) {
      res.status(400).json(this.createErrorResponse("Bad Request"));
      return;
    }

    const transport = this.transports[sessionId];
    await transport.handleRequest(req, res);
    return;
  }

  async handleLegacySSE(req: express.Request, res: express.Response) {
    try {
      // Create new transport and server for legacy SSE
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: false
      });

      const server = createMCPServer();
      await server.connect(transport);

      // Handle the SSE connection directly
      await transport.handleRequest(req, res);

      // Store the session after successful connection
      if (transport.sessionId) {
        this.transports[transport.sessionId] = transport;
        this.servers[transport.sessionId] = server;
        log('info', 'LEGACY-SSE', `Legacy SSE session created: ${transport.sessionId}`, {
          totalSessions: Object.keys(this.transports).length
        });

        // Clean up on disconnect
        req.on('close', () => {
          log('info', 'LEGACY-SSE', `Connection closed: ${transport.sessionId}`);
          this.cleanupSession(transport.sessionId!).catch(console.error);
        });
      }

    } catch (error) {
      console.error('Error handling legacy SSE connection:', error);
      if (!res.headersSent) {
        res.status(500).json(this.createErrorResponse("Internal error creating SSE connection"));
      }
    }
  }

  async handleLegacyMessages(req: express.Request, res: express.Response) {
    try {
      const sessionId = req.query.sessionId as string;
      
      if (!sessionId) {
        res.status(400).json(this.createErrorResponse("sessionId query parameter is required"));
        return;
      }

      const transport = this.transports[sessionId];
      if (!transport) {
        res.status(404).json(this.createErrorResponse("Session not found"));
        return;
      }

      // Handle the request with existing transport
      await transport.handleRequest(req, res, req.body);
      
    } catch (error) {
      console.error('Error handling legacy messages request:', error);
      if (!res.headersSent) {
        res.status(500).json(this.createErrorResponse("Internal error"));
      }
    }
  }

  private createErrorResponse(message: string, id: any = null) {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message
      },
      id
    };
  }

  getActiveSessions(): number {
    return Object.keys(this.transports).length;
  }

  async cleanupSession(sessionId: string): Promise<boolean> {
    if (this.transports[sessionId]) {
      const server = this.servers[sessionId];
      if (server) {
        await server.close().catch(console.error);
        delete this.servers[sessionId];
      }
      delete this.transports[sessionId];
      log('info', 'CLEANUP', `Session cleaned up: ${sessionId}`, {
        remainingSessions: Object.keys(this.transports).length
      });
      return true;
    }
    return false;
  }

  async shutdown() {
    console.log('\nShutting down server...');
    for (const [sessionId, server] of Object.entries(this.servers)) {
      await server.close().catch(console.error);
    }
  }
}

async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
  const endpoint = process.env.MCP_ENDPOINT || '/mcp';

  // Create Express app
  const app = express();
  const mcpServer = new MCPServerWrapper();
  
  // Middleware
  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    log('debug', 'HEALTH', 'Health check requested');
    res.json({ 
      status: 'ok', 
      transport: 'streamable-http',
      activeSessions: mcpServer.getActiveSessions(),
      timestamp: new Date().toISOString()
    });
  });

  // Single MCP endpoint - POST for requests
  app.post(endpoint, async (req, res) => {
    await mcpServer.handlePostRequest(req, res);
  });

  // Single MCP endpoint - GET for SSE streams
  app.get(endpoint, async (req, res) => {
    await mcpServer.handleGetRequest(req, res);
  });

  // Legacy SSE endpoint for MCP Inspector compatibility
  app.get('/sse', async (req, res) => {
    await mcpServer.handleLegacySSE(req, res);
  });

  // Legacy messages endpoint for SSE transport
  app.post('/messages', async (req, res) => {
    await mcpServer.handleLegacyMessages(req, res);
  });

  // Session cleanup endpoint (DELETE)
  app.delete(`${endpoint}/:sessionId`, async (req, res) => {
    const sessionId = req.params.sessionId;
    const cleaned = await mcpServer.cleanupSession(sessionId);
    
    if (cleaned) {
      res.status(204).send();
    } else {
      res.status(404).json(createErrorResponse("Session not found"));
    }
  });

  // Start Express server
  app.listen(port, () => {
    console.log(`MCP Server running on port ${port}`);
    console.log(`Log Level: ${LOG_LEVEL}`);
    console.log(`Endpoints:`);
    console.log(`  - Streamable HTTP: POST ${endpoint}`);
    console.log(`  - SSE Stream: GET ${endpoint}`);
    console.log(`  - Legacy SSE: GET /sse`);
    console.log(`  - Legacy Messages: POST /messages`);
    console.log(`  - Health Check: GET /health`);
    console.log(`\nServer is ready to accept connections from Claude.ai and other MCP clients.`);
    
    log('info', 'STARTUP', `MCP Server started successfully`, {
      port,
      logLevel: LOG_LEVEL,
      endpoints: [endpoint, '/sse', '/messages', '/health']
    });
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    await mcpServer.shutdown();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});