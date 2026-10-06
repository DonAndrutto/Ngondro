const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname,'..');
function createServer(reference = path.join(root,'../Ewam/index.html')) {
  return http.createServer((req,res) => {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/ewam') {res.writeHead(301,{Location:'/ewam/'}).end();return;}
    const ewam = url.pathname.startsWith('/ewam/');
    const base = ewam ? path.dirname(reference) : root;
    const relative = url.pathname.replace(ewam ? /^\/ewam\// : /^\/Ngondro\//,'/');
    const file = ewam && relative === '/' ? reference : path.resolve(base,'.'+decodeURIComponent(relative.endsWith('/') ? relative+'index.html' : relative));
    if (!file.startsWith(base+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404).end();return;}
    res.setHeader('Content-Type',{'.html':'text/html; charset=utf-8','.js':'text/javascript',
      '.css':'text/css','.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png','.jpg':'image/jpeg',
      '.webmanifest':'application/manifest+json'}[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
}
module.exports = {createServer};
