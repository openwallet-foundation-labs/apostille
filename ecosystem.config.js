module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: './backend',
      script: 'yarn',
      args: 'start',
      watch: false,
      autorestart: true,
      max_memory_restart: '4G',
      env: {
        NODE_ENV: 'dev',
        // These must be set in your environment or .env file
        DATABASE_URL: process.env.DATABASE_URL,
        JWT_SECRET: process.env.JWT_SECRET
      }
    },
    {
      name: 'frontend',
      cwd: './frontend',
      script: 'yarn',
      args: 'start',
      watch: false,
      autorestart: true,
      max_memory_restart: '4G',
      env: {
        NODE_ENV: 'dev',
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3002',
        NEXT_PUBLIC_COMPANY_NAME: 'Essi Studio',
        NEXT_PUBLIC_COMPANY_LOGO_URL: 'https://www.example.com/icon.png',
        YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
        YARN_IGNORE_PATH: 'true'
      }
    }
  ]
};
