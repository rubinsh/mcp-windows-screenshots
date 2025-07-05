# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is an MCP (Model Context Protocol) server that enables Claude to access Windows screenshots from WSL2 environments. It's designed to simplify screenshot sharing by eliminating the need for manual file path navigation.

## Development Commands
```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Development mode with auto-rebuild
npm run dev

# Test the server locally
node dist/index.js
```

## MCP Server Architecture
- **Transport**: stdio-based communication
- **Tools Provided**:
  - `list_screenshots`: Lists recent screenshots with metadata
  - `get_screenshot`: Retrieves a specific screenshot (path or base64 content)
  - `list_directories`: Shows all configured screenshot directories
- **Entry Points**:
  - `cli.js`: NPX entry point that spawns the server
  - `src/index.ts`: Main server implementation

## Testing the MCP Server
To test changes locally before publishing:
```bash
# Build and test with Claude Code
npm run build
claude mcp add windows-screenshots-dev node /path/to/project/dist/index.js

# Remember to remove test server after testing
claude mcp remove windows-screenshots-dev
```

## Publishing to NPM
```bash
# Bump version in package.json
npm version patch  # or minor/major

# Publish (build runs automatically via prepublishOnly)
npm publish

# Test the published version
npx mcp-windows-screenshots@latest
```

## Common Development Tasks
- **Adding new screenshot directories**: Modify `getScreenshotDirectories()` in src/index.ts
- **Changing file patterns**: Update the glob patterns in `list_screenshots` tool
- **Adding new MCP tools**: Follow the pattern in `server.setRequestHandler()` 
- **Debugging MCP communication**: Errors go to stderr, use `console.error()` for debugging

## Important Notes
- This is an MCP server meant to be installed via `claude mcp add` command
- Users install it with: `claude mcp add windows-screenshots -- npx mcp-windows-screenshots@latest`
- Environment variables (WINDOWS_USERNAME, MCP_SCREENSHOT_DIRS) are passed via `-e` flags during installation
- The server runs as a subprocess of Claude Code and communicates via stdio