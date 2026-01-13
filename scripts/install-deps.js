#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('📦 Installing dependencies for all services...\n');

const services = ['backend', 'frontend', 'mcp-server', 'scheduler'];

services.forEach(service => {
  const servicePath = path.join(__dirname, '..', service);
  const nodeModulesPath = path.join(servicePath, 'node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    console.log(`Installing ${service}...`);
    try {
      execSync('pnpm install', {
        cwd: servicePath,
        stdio: 'inherit'
      });
    } catch (error) {
      console.error(`Failed to install ${service}`);
    }
  } else {
    console.log(`✓ ${service} dependencies already installed`);
  }
});

console.log('\n✅ All dependencies installed!\n');
