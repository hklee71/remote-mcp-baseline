#!/usr/bin/env node

const http = require('http');

console.log('Testing Legacy SSE Transport...\n');

// Test 1: Establish SSE connection and extract session ID
console.log('1. Testing SSE connection establishment...');

const sseReq = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/sse',
  method: 'GET',
  headers: {
    'Accept': 'text/event-stream',
    'Cache-Control': 'no-cache'
  }
}, (res) => {
  console.log(`   Status: ${res.statusCode}`);
  
  if (res.statusCode === 200) {
    console.log('   ✅ SSE connection established');
    
    let sessionId = null;
    
    res.on('data', (chunk) => {
      const data = chunk.toString();
      console.log(`   Received: ${data.trim()}`);
      
      // Extract session ID from endpoint event
      const match = data.match(/sessionId=([a-f0-9-]+)/);
      if (match) {
        sessionId = match[1];
        console.log(`   📝 Session ID: ${sessionId}`);
        
        // Close SSE connection
        res.destroy();
        
        // Test 2: Send initialize message
        setTimeout(() => testMessages(sessionId), 100);
      }
    });
    
    res.on('close', () => {
      console.log('   🔚 SSE connection closed\n');
    });
    
    res.on('error', (err) => {
      console.log(`   ❌ SSE error: ${err.message}`);
    });
  } else {
    console.log(`   ❌ SSE connection failed with status ${res.statusCode}`);
    process.exit(1);
  }
});

sseReq.on('error', (err) => {
  console.log(`❌ SSE request error: ${err.message}`);
  process.exit(1);
});

sseReq.end();

// Test 2: Send messages using extracted session ID
function testMessages(sessionId) {
  console.log('2. Testing legacy messages endpoint...');
  
  const initMessage = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize", 
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  };
  
  const postData = JSON.stringify(initMessage);
  
  const messagesReq = http.request({
    hostname: 'localhost',
    port: 3001,
    path: `/messages?sessionId=${sessionId}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (res) => {
    console.log(`   Status: ${res.statusCode}`);
    
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const response = JSON.parse(responseData);
          console.log(`   ✅ Initialize response received`);
          console.log(`   📝 Response: ${JSON.stringify(response, null, 2)}`);
        } catch (err) {
          console.log(`   ❌ Invalid JSON response: ${responseData}`);
        }
      } else {
        console.log(`   ❌ Messages request failed: ${responseData}`);
      }
      
      console.log('\n🎉 Legacy SSE transport test completed!');
      process.exit(0);
    });
  });
  
  messagesReq.on('error', (err) => {
    console.log(`❌ Messages request error: ${err.message}`);
    process.exit(1);
  });
  
  messagesReq.write(postData);
  messagesReq.end();
}