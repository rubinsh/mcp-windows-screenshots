#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { readFile, stat } from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import os from 'os';

const server = new Server(
  {
    name: 'mcp-windows-screenshots',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Default screenshot directories
const getScreenshotDirectories = (): string[] => {
  const username = os.userInfo().username;
  const windowsUsername = process.env.WINDOWS_USERNAME || username;
  
  return [
    `/mnt/c/Users/${windowsUsername}/Pictures/Screenshots`,
    `/mnt/c/Users/${windowsUsername}/Pictures`,
    `/mnt/c/Users/${windowsUsername}/OneDrive/Pictures/Screenshots`,
    `/mnt/c/Users/${windowsUsername}/Documents/Screenshots`,
    `/mnt/c/Users/${windowsUsername}/Desktop`,
    // Temp directories where some tools save screenshots
    `/mnt/c/Users/${windowsUsername}/AppData/Local/Temp`,
    `/mnt/c/Windows/Temp`,
  ];
};

// Get custom directories from environment variable
const getCustomDirectories = (): string[] => {
  // Check for multiple directories first (semicolon-separated)
  const customDirs = process.env.MCP_SCREENSHOT_DIRS;
  if (!customDirs) return [];
  
  // If it contains semicolons, split by semicolon
  if (customDirs.includes(';')) {
    return customDirs.split(';').filter(dir => dir.trim());
  }
  
  // Otherwise, treat as a single directory
  return [customDirs.trim()];
};

// Tools available
const tools: Tool[] = [
  {
    name: 'list_screenshots',
    description: 'List recent screenshots from Windows directories',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of screenshots to return (default: 20)',
          default: 20,
        },
        pattern: {
          type: 'string',
          description: 'Glob pattern to filter files (default: *.{png,jpg,jpeg,bmp,gif})',
          default: '*.{png,jpg,jpeg,bmp,gif}',
        },
        directory: {
          type: 'string',
          description: 'Specific directory to search (optional, searches all configured dirs by default)',
        },
      },
    },
  },
  {
    name: 'get_screenshot',
    description: 'Get a specific screenshot file path or content',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Full path to the screenshot file',
        },
        return_content: {
          type: 'boolean',
          description: 'Return base64 encoded content instead of just the path (default: false)',
          default: false,
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directories',
    description: 'List all configured screenshot directories',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Register handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'list_screenshots': {
      const limit = (args?.limit as number) || 20;
      const pattern = (args?.pattern as string) || '*.{png,jpg,jpeg,bmp,gif}';
      const specificDir = args?.directory as string | undefined;
      
      const directories = specificDir 
        ? [specificDir] 
        : [...getScreenshotDirectories(), ...getCustomDirectories()];
      
      const allFiles: { path: string; mtime: Date; size: number }[] = [];
      
      for (const dir of directories) {
        try {
          const files = await glob(path.join(dir, pattern as string), {
            windowsPathsNoEscape: true,
            nodir: true,
          });
          
          for (const file of files) {
            try {
              const stats = await stat(file);
              allFiles.push({
                path: file,
                mtime: stats.mtime,
                size: stats.size,
              });
            } catch (e) {
              // Skip files we can't stat
            }
          }
        } catch (e) {
          // Skip directories that don't exist or can't be accessed
        }
      }
      
      // Sort by modification time (newest first) and limit
      allFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      const limitedFiles = allFiles.slice(0, limit as number);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              count: limitedFiles.length,
              total_found: allFiles.length,
              screenshots: limitedFiles.map(f => ({
                path: f.path,
                modified: f.mtime.toISOString(),
                size_kb: Math.round(f.size / 1024),
              })),
            }, null, 2),
          },
        ],
      };
    }

    case 'get_screenshot': {
      const filePath = args?.path as string | undefined;
      const returnContent = (args?.return_content as boolean) || false;
      
      if (!filePath) {
        throw new Error('File path is required');
      }
      
      try {
        const stats = await stat(filePath);
        
        if (returnContent) {
          const content = await readFile(filePath);
          const base64 = content.toString('base64');
          const mimeType = path.extname(filePath as string).toLowerCase() === '.png' 
            ? 'image/png' 
            : 'image/jpeg';
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  path: filePath,
                  modified: stats.mtime.toISOString(),
                  size_kb: Math.round(stats.size / 1024),
                  content: `data:${mimeType};base64,${base64}`,
                }, null, 2),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  path: filePath,
                  modified: stats.mtime.toISOString(),
                  size_kb: Math.round(stats.size / 1024),
                  message: 'Use this path with Claude Code\'s Read tool to view the image',
                }, null, 2),
              },
            ],
          };
        }
      } catch (error) {
        throw new Error(`Failed to access screenshot: ${error}`);
      }
    }

    case 'list_directories': {
      const defaultDirs = getScreenshotDirectories();
      const customDirs = getCustomDirectories();
      
      const dirInfo = await Promise.all(
        [...defaultDirs, ...customDirs].map(async (dir) => {
          try {
            await stat(dir);
            return { path: dir, exists: true };
          } catch {
            return { path: dir, exists: false };
          }
        })
      );
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              default_directories: dirInfo.filter((_, i) => i < defaultDirs.length),
              custom_directories: dirInfo.filter((_, i) => i >= defaultDirs.length),
              environment_variable: 'MCP_SCREENSHOT_DIRS',
              current_value: process.env.MCP_SCREENSHOT_DIRS || '(not set)',
              windows_username: process.env.WINDOWS_USERNAME || '(not set)',
              usage: 'Set MCP_SCREENSHOT_DIRS=/path/to/dir or use semicolon for multiple: /path/1;/path/2',
            }, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Windows Screenshots server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});