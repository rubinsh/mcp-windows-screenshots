# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-01-24

### Added
- **Automatic screenshot folder detection** - The tool now automatically detects your Windows Screenshots folder location by querying the Windows registry
- **Cross-platform support** - Works seamlessly on both native Windows and WSL2 environments without configuration
- **Environment detection** - Automatically detects whether running in WSL2 or native Windows and uses appropriate path formats
- **Zero configuration installation** - Simple one-command installation that works for most users without any environment variables

### Changed
- Installation now requires no configuration for most users - just run `claude mcp add windows-screenshots -s user -- npx mcp-windows-screenshots@latest`
- Registry query uses correct method for both WSL2 (`reg.exe`) and Windows (native `reg.exe` without shell)
- README restructured to emphasize simple installation with advanced configuration moved to separate section

### Fixed
- Fixed registry query on native Windows by removing `shell: true` option that was causing parsing issues
- Path detection now properly handles custom Windows Screenshots folders (e.g., OneDrive locations)

## [1.0.0] - 2025-01-05

### Added
- Initial release of MCP Windows Screenshots
- Support for listing recent screenshots from Windows directories in WSL2
- Support for retrieving screenshot paths for use with Claude Code
- Configurable screenshot directories via environment variables
- Automatic detection of common Windows screenshot locations
- File pattern filtering (png, jpg, jpeg, bmp, gif)
- NPX-based installation for easy setup
- Three MCP tools:
  - `list_screenshots` - List recent screenshots with metadata
  - `get_screenshot` - Get specific screenshot path or content
  - `list_directories` - Show configured screenshot directories

### Features
- Smart directory detection for common screenshot locations
- Support for OneDrive and custom paths
- Environment variable configuration for Windows username and custom directories
- Semicolon-separated multiple directory support
- TypeScript implementation with full type safety
