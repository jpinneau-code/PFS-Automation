#!/usr/bin/env node

const { spawn } = require('child_process');
const { exec } = require('child_process');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║         PFS Automation - Development Mode                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Step 1: Start Docker infrastructure
console.log('🐳 Starting Docker infrastructure (PostgreSQL + Redis)...\n');

const dockerProcess = spawn('docker-compose', ['up', 'postgres', 'redis'], {
  cwd: process.cwd(),
  stdio: 'pipe'
});

let postgresReady = false;
let redisReady = false;

dockerProcess.stdout.on('data', (data) => {
  const output = data.toString();

  // Check for PostgreSQL ready
  if (output.includes('database system is ready to accept connections')) {
    postgresReady = true;
    console.log('✅ PostgreSQL is ready\n');
  }

  // Check for Redis ready
  if (output.includes('Ready to accept connections')) {
    redisReady = true;
    console.log('✅ Redis is ready\n');
  }

  // When both are ready, start the app services
  if (postgresReady && redisReady && !servicesStarted) {
    servicesStarted = true;
    startAppServices();
  }
});

dockerProcess.stderr.on('data', (data) => {
  // Ignore network warnings
  if (!data.toString().includes('obsolete') && !data.toString().includes('Pool overlaps')) {
    console.error(data.toString());
  }
});

let servicesStarted = false;

function startAppServices() {
  console.log('🚀 Starting application services...\n');

  // Step 2: Run backend migrations
  console.log('📊 Running database migrations...\n');
  exec('cd backend && pnpm exec node ace.js migration:run --force', (error, stdout, stderr) => {
    if (error && !error.message.includes('Already up to date')) {
      console.error('Migration error (this might be OK if tables exist):', error.message);
    }
    if (stdout) console.log(stdout);

    // Step 3: Start backend and frontend
    console.log('🟢 Starting Backend on port 3333...');
    console.log('🔵 Starting Frontend on port 3000...\n');

    const concurrentProcess = spawn('npx', [
      'concurrently',
      '-n', 'backend,frontend',
      '-c', 'green,cyan',
      'cd backend && pnpm run dev',
      'cd frontend && pnpm run dev'
    ], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true
    });

    // Open browser after a delay
    setTimeout(() => {
      console.log('\n🌐 Opening browser at http://localhost:3000\n');
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${command} http://localhost:3000`);
    }, 5000);

    concurrentProcess.on('exit', (code) => {
      console.log('\n👋 Shutting down...');
      dockerProcess.kill();
      process.exit(code);
    });
  });
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down all services...');
  dockerProcess.kill();
  process.exit(0);
});

// Wait for infrastructure to be ready (timeout after 30 seconds)
setTimeout(() => {
  if (!servicesStarted) {
    console.log('⏱️  Infrastructure took too long to start. Check Docker logs.');
    console.log('You may need to manually start services or check for port conflicts.\n');
    dockerProcess.kill();
    process.exit(1);
  }
}, 30000);
