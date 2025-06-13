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

      // Check if this is an initialize request
      if (isInitializeRequest(requestBody)) {
        // Initialize requests should not have a session ID
        if (sessionId) {
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

        // Handle the initialize request (this will generate the session ID)
        await transport.handleRequest(req, res, requestBody);

        // Store transport and server by session ID
        if (transport.sessionId) {
          this.transports[transport.sessionId] = transport;
          this.servers[transport.sessionId] = server;
          console.log(`New session created: ${transport.sessionId}`);
        }
      } else {
        // Non-initialize requests must have a session ID
        if (!sessionId) {
          res.status(400).json(this.createErrorResponse("Mcp-Session-Id header is required"));
          return;
        }

        // Find existing transport
        const transport = this.transports[sessionId];
        if (!transport) {
          res.status(404).json(this.createErrorResponse("Session not found"));
          return;
        }

        // Handle request with existing transport
        await transport.handleRequest(req, res, requestBody);
      }
    } catch (error) {
      console.error('Error handling POST request:', error);
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
      console.log(`Session cleaned up: ${sessionId}`);
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
    console.log(`Endpoints:`);
    console.log(`  - Streamable HTTP: POST ${endpoint}`);
    console.log(`  - SSE Stream: GET ${endpoint}`);
    console.log(`  - Health Check: GET /health`);
    console.log(`\nServer is ready to accept connections from Claude.ai and other MCP clients.`);
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