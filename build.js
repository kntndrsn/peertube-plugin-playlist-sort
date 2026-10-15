const esbuild = require('esbuild')

esbuild.build({
  entryPoints: [ 'client/common-client-plugin.js' ],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2017',
  outfile: 'dist/common-client-plugin.js'
}).catch(() => process.exit(1))
