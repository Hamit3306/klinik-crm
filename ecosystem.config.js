module.exports = {
  apps: [{
    name: 'klinik-meta-crm',
    script: 'server.js',
    instances: 1, // SQLite kullanıldığı için 1 instance kalmalı, aksi takdirde DB kilidi sorunları yaşanır
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
