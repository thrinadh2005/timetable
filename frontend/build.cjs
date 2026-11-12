const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const frontendDir = __dirname;
const projectRoot = path.resolve(__dirname, '..');
const publicJsDir = path.resolve(projectRoot, 'public', 'js');

async function build() {
  if (!fs.existsSync(publicJsDir)) {
    fs.mkdirSync(publicJsDir, { recursive: true });
  }

  const result = await esbuild.build({
    entryPoints: [path.resolve(frontendDir, 'entry.tsx')],
    bundle: true,
    outfile: path.resolve(publicJsDir, 'bundle.js'),
    format: 'iife',
    globalName: 'GMRITDUApp',
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    treeShaking: true,
    sourcemap: false,
    legalComments: 'none',
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.PORT': '3000'
    },
    alias: {
      'next/navigation': path.resolve(frontendDir, 'next-mock.ts'),
      '@/lib/academic-contract': path.resolve(frontendDir, 'src', 'lib', 'academic-contract.ts'),
      '@/lib/backend-client': path.resolve(frontendDir, 'src', 'lib', 'backend-client.ts'),
      '@/lib/use-live-resource': path.resolve(frontendDir, 'src', 'lib', 'use-live-resource.ts'),
    },
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.js': 'js',
      '.jsx': 'jsx',
      '.svg': 'text'
    },
    logLevel: 'info'
  });

  const indexHtmlPath = path.resolve(projectRoot, 'public', 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');
    const cacheTag = `v=4.5.${Date.now()}`;
    const updated = html.replace(/\/js\/bundle\.js(\?v=[^"']*)?/g, `/js/bundle.js?${cacheTag}`);
    if (updated !== html) {
      fs.writeFileSync(indexHtmlPath, updated, 'utf8');
    }
  }

  console.log('Build succeeded! Output written to public/js/bundle.js');
}

build().catch((err) => {
  console.error('Build error:', err);
  process.exit(1);
});
