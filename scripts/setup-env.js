#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Setting up environment files...\n');

// Generate secure APP_KEY
function generateAppKey() {
  try {
    return execSync('openssl rand -base64 32').toString().trim();
  } catch (error) {
    // Fallback if openssl is not available
    return require('crypto').randomBytes(32).toString('base64');
  }
}

// Copy .env.example to .env for each service if not exists
const services = ['', 'backend', 'frontend', 'mcp-server', 'scheduler'];

services.forEach(service => {
  const dir = service ? path.join(__dirname, '..', service) : path.join(__dirname, '..');
  const exampleFile = path.join(dir, '.env.example');
  const envFile = path.join(dir, '.env');

  if (fs.existsSync(exampleFile) && !fs.existsSync(envFile)) {
    console.log(`✓ Creating ${service || 'root'}/.env`);
    let content = fs.readFileSync(exampleFile, 'utf8');

    // Replace placeholders with secure values
    if (service === '' || service === 'backend') {
      const appKey = generateAppKey();
      content = content.replace(
        'APP_KEY=generate_a_secure_random_key_here_32_chars_min',
        `APP_KEY=${appKey}`
      );
      content = content.replace(
        'POSTGRES_PASSWORD=change_me_secure_password',
        'POSTGRES_PASSWORD=dev_password_123'
      );
    }

    fs.writeFileSync(envFile, content);
  } else if (fs.existsSync(envFile)) {
    console.log(`⊙ ${service || 'root'}/.env already exists (skipping)`);
  }
});

console.log('\n✅ Environment files setup complete!');
console.log('\n⚠️  Note: For production, please update passwords in .env files\n');
