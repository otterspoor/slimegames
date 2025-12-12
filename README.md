# Slime Sports

A TypeScript-based sports game featuring slime characters playing soccer and volleyball.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the project:
   ```bash
   npm run build
   ```

This will:
- Compile TypeScript and bundle all JavaScript into a single file using esbuild
- Inline the JavaScript into the HTML
- Output `dist/index.html` which can be opened directly in a browser (no CORS issues!)

## Development

Watch mode for development:
```bash
npm run watch
```

This will watch for changes and automatically rebuild and inline the JavaScript.

## Project Structure

- `src/` - TypeScript source files
- `dist/` - Compiled output (generated)
- `scripts/` - Build scripts
- `index.html` - HTML template (used to generate `dist/index.html`)

## Opening the Game

Simply open `dist/index.html` in your browser after running `npm run build`. No server needed!


