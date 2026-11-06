'use strict';
require('node:http').createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Hello from AWS App Deployer!\n');
}).listen(3000, '0.0.0.0');
