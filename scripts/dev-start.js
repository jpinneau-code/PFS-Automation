#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║         PFS Automation - Development Mode                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

async function checkContainerRunning(name) {
  try {
    const { stdout } = await execAsync(`docker ps --filter name=${name} --filter status=running --format "{{.Names}}"`);
    return stdout.trim() === name;
  } catch {
    return false;
  }
}

async function startInfrastructure() {
  console.log('🐳 Starting Docker infrastructure (PostgreSQL + Redis + Mailhog)...\n');

  // Start containers (will do nothing if already running)
  exec('docker-compose up -d postgres redis mailhog', { cwd: process.cwd() });

  // Wait for containers to be ready
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    const postgresRunning = await checkContainerRunning('postgres-pfs');
    const redisRunning = await checkContainerRunning('audit-redis');
    const mailhogRunning = await checkContainerRunning('pfs-mailhog');

    if (postgresRunning && redisRunning && mailhogRunning) {
      console.log('✅ PostgreSQL is ready');
      console.log('✅ Redis is ready');
      console.log('✅ Mailhog is ready (Web UI: http://localhost:8025)\n');

      // Give database a moment to fully initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
      return true;
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return false;
}

function startAppServices() {
  console.log('🚀 Starting application services...\n');
  console.log('🟢 Starting Backend on port 3333...');
  console.log('🔵 Starting Frontend on port 3000...\n');

  const concurrentProcess = spawn('npx', [
    'concurrently',
    '-n', 'backend,frontend',
    '-c', 'green,cyan',
    './scripts/start-backend.sh',
    './scripts/start-frontend.sh'
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
  }, 8000);

  concurrentProcess.on('exit', (code) => {
    console.log('\n👋 Shutting down...');
    exec('docker-compose stop postgres redis');
    process.exit(code);
  });

  return concurrentProcess;
}

// Main execution
(async () => {
  try {
    const infraReady = await startInfrastructure();

    if (!infraReady) {
      console.log('⏱️  Infrastructure took too long to start. Check Docker logs.');
      console.log('You may need to manually start services or check for port conflicts.\n');
      process.exit(1);
    }

    const appProcess = startAppServices();

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n\n👋 Shutting down all services...');
      appProcess.kill();
      exec('docker-compose stop postgres redis');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error starting services:', error);
    process.exit(1);
  }
})();
