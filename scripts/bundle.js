const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const isWatch = process.argv.includes('--watch');
const htmlTemplatePath = path.join(__dirname, '../index.html');
const distDir = path.join(__dirname, '../dist');
const bundlePath = path.join(distDir, 'bundle.js');
const outputHtmlPath = path.join(distDir, 'index.html');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const scriptTagRegex = /<script[^>]*src="[^"]*"[^>]*><\/script>/;

function readHtmlTemplate() {
  const htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf8');
  if (!htmlTemplate.match(scriptTagRegex)) {
    console.error('Could not find script tag in index.html');
    process.exit(1);
  }
  return htmlTemplate;
}

// Inline the bundled JS into HTML
function inlineBundle() {
  if (!fs.existsSync(bundlePath)) {
    console.error('Bundle file not found');
    return false;
  }

  // In watch mode, we want index.html edits to reflect immediately.
  const htmlTemplate = readHtmlTemplate();
  const bundledJs = fs.readFileSync(bundlePath, 'utf8');
  const newHtml = htmlTemplate.replace(scriptTagRegex, `<script>${bundledJs}</script>`);
  fs.writeFileSync(outputHtmlPath, newHtml);
  console.log('✓ dist/index.html created');
  return true;
}

// Build configuration
const buildOptions = {
  entryPoints: [path.join(__dirname, '../src/main.ts')],
  bundle: true,
  format: 'iife',
  outfile: bundlePath,
  platform: 'browser',
  target: 'es2020',
  minify: false,
};

function openBrowser() {
  const htmlPath = path.resolve(outputHtmlPath);
  const url = `file:///${htmlPath.replace(/\\/g, '/')}`;
  
  // Try to open browser (works on Windows, Mac, Linux)
  const command = process.platform === 'win32' 
    ? `start "" "${htmlPath}"`
    : process.platform === 'darwin'
    ? `open "${htmlPath}"`
    : `xdg-open "${htmlPath}"`;
  
  exec(command, (error) => {
    if (error) {
      console.log(`Could not open browser automatically. Please open: ${htmlPath}`);
    } else {
      console.log(`✓ Opened browser`);
    }
  });
}

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      
      // Initial build
      await ctx.rebuild();
      inlineBundle();
      console.log('Watching for changes...');
      
      // Open browser on first build
      openBrowser();
      
      // Watch for changes and inline on rebuild
      await ctx.watch();
      
      // Poll for bundle file changes and inline
      let lastModified = 0;
      setInterval(() => {
        if (fs.existsSync(bundlePath)) {
          const stats = fs.statSync(bundlePath);
          if (stats.mtimeMs > lastModified) {
            lastModified = stats.mtimeMs;
            inlineBundle();
          }
        }
      }, 200);
    } else {
      await esbuild.build(buildOptions);
      console.log('Bundle created successfully');
      if (!inlineBundle()) {
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
