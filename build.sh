#!/bin/bash

echo "Building Remote MCP Server..."

# Clean previous build
echo "Cleaning previous build..."
rm -rf dist

# Create dist directories
mkdir -p dist/server dist/handlers

# Copy TypeScript files as JavaScript (temporary workaround)
echo "Building server files..."
cp src/server/*.ts dist/server/
cp src/handlers/*.ts dist/handlers/

# Rename .ts to .js
for file in dist/**/*.ts; do
  mv "$file" "${file%.ts}.js"
done

echo "Build complete!"
echo "Note: This is a temporary build script. Use 'npm run build' with proper TypeScript compilation for production."