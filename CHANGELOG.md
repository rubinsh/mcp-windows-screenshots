# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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