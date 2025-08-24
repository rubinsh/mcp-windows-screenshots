#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { readFile, stat, access } from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

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

// Detect environment (WSL, Windows, or Linux)
function detectEnvironment(): { type: 'windows' | 'wsl' | 'linux', pathPrefix: string } {
  const platform = process.platform;
  
  if (platform === 'win32') {
    return { type: 'windows', pathPrefix: '' };
  } else if (platform === 'linux') {
    // Check if WSL
    const isWSL = existsSync('/proc/sys/fs/binfmt_misc/WSLInterop') || 
                  Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
    return isWSL 
      ? { type: 'wsl', pathPrefix: '/mnt/c' }
      : { type: 'linux', pathPrefix: '' };
  }
  return { type: 'linux', pathPrefix: '' };
}

// Query Windows registry for Screenshots folder location
function getWindowsScreenshotPath(): string | null {
  const env = detectEnvironment();
  
  try {
    if (env.type === 'wsl') {
      // Use reg.exe from WSL
      const result = spawnSync('reg.exe', [
        'query',
        'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
        '/v', '{B7BEDE81-DF94-4682-A7D8-57A52620B86F}'
      ], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
      });
      
      if (result.status === 0 && result.stdout) {
        // Parse the output to extract the path
        const lines = result.stdout.split('\n');
        for (const line of lines) {
          if (line.includes('{B7BEDE81-DF94-4682-A7D8-57A52620B86F}')) {
            const parts = line.split('REG_EXPAND_SZ');
            if (parts.length > 1) {
              let path = parts[1].trim();
              // Expand %USERPROFILE%
              const windowsUsername = process.env.WINDOWS_USERNAME || os.userInfo().username;
              path = path.replace('%USERPROFILE%', `C:\\Users\\${windowsUsername}`);
              // Convert to WSL path
              return path.replace('C:\\', '/mnt/c/').replace(/\\/g, '/');
            }
          }
        }
      }
    } else if (env.type === 'windows') {
      // On native Windows, use reg.exe directly (no shell needed)
      const result = spawnSync('reg.exe', [
        'query',
        'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
        '/v',
        '{B7BEDE81-DF94-4682-A7D8-57A52620B86F}'
      ], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
      });
      
      if (result.status === 0 && result.stdout) {
        const lines = result.stdout.split('\n');
        for (const line of lines) {
          if (line.includes('{B7BEDE81-DF94-4682-A7D8-57A52620B86F}')) {
            const parts = line.split('REG_EXPAND_SZ');
            if (parts.length > 1) {
              let path = parts[1].trim();
              // Expand environment variables
              path = path.replace('%USERPROFILE%', process.env.USERPROFILE || `C:\\Users\\${os.userInfo().username}`);
              return path;
            }
          }
        }
      }
    }
  } catch (error) {
    // Registry query failed silently, will use defaults
    // This is expected in some environments (e.g., containers, CI/CD)
  }
  
  return null;
}

// Default screenshot directories
const getScreenshotDirectories = (): string[] => {
  const username = os.userInfo().username;
  const windowsUsername = process.env.WINDOWS_USERNAME || username;
  const env = detectEnvironment();
  
  // Try to get the actual Screenshots folder from registry first
  const registryPath = getWindowsScreenshotPath();
  const directories: string[] = [];
  
  if (registryPath) {
    directories.push(registryPath);
  }
  
  // Add default paths based on environment
  if (env.type === 'wsl') {
    // WSL paths
    directories.push(
      `/mnt/c/Users/${windowsUsername}/Pictures/Screenshots`,
      `/mnt/c/Users/${windowsUsername}/Pictures`,
      `/mnt/c/Users/${windowsUsername}/OneDrive/Pictures/Screenshots`,
      `/mnt/c/Users/${windowsUsername}/OneDrive/Pictures 2/Screenshots 1`,
      `/mnt/c/Users/${windowsUsername}/Documents/Screenshots`,
      `/mnt/c/Users/${windowsUsername}/Desktop`,
      `/mnt/c/Users/${windowsUsername}/AppData/Local/Temp`,
      `/mnt/c/Windows/Temp`
    );
  } else if (env.type === 'windows') {
    // Native Windows paths
    directories.push(
      `C:\\Users\\${windowsUsername}\\Pictures\\Screenshots`,
      `C:\\Users\\${windowsUsername}\\Pictures`,
      `C:\\Users\\${windowsUsername}\\OneDrive\\Pictures\\Screenshots`,
      `C:\\Users\\${windowsUsername}\\OneDrive\\Pictures 2\\Screenshots 1`,
      `C:\\Users\\${windowsUsername}\\Documents\\Screenshots`,
      `C:\\Users\\${windowsUsername}\\Desktop`,
      `C:\\Users\\${windowsUsername}\\AppData\\Local\\Temp`,
      `C:\\Windows\\Temp`
    );
  }
  
  // Remove duplicates
  return [...new Set(directories)];
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