module.exports = {
  apps: [{
    name:          'costos-web',
    script:        'node_modules/next/dist/bin/next',
    args:          'start',
    cwd:           'C:\\Users\\Usuario\\Documents\\react\\costos-web\\costos-web',
    interpreter:   'node',
    env: {
      NODE_ENV:      'production',
      PORT:          3000,
      NEXTAUTH_URL:  'http://192.168.1.191:3000',
    },
    watch:         false,
    restart_delay: 5000,
    max_restarts:  10,
  }]
}