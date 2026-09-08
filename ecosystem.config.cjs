module.exports = {
  apps: [
    {
      name:          'costos-web',
      script:        'node_modules/next/dist/bin/next',
      args:          'start',
      cwd:           'C:\\Users\\Usuario\\Documents\\react\\costos-web\\costos-web',
      interpreter:   'node',
      env: {
        NODE_ENV:      'production',
        PORT:          3000,
        NEXTAUTH_URL:  'https://192.168.1.191',
      },
      watch:         false,
      restart_delay: 5000,
      max_restarts:  10,
    },
    {
      // Reverse proxy HTTPS delante de costos-web — ver Caddyfile.
      name:          'costos-web-https',
      script:        'C:\\Users\\Usuario\\AppData\\Local\\Microsoft\\WinGet\\Packages\\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\\caddy.exe',
      args:          'run --config Caddyfile --adapter caddyfile',
      cwd:           'C:\\Users\\Usuario\\Documents\\react\\costos-web\\costos-web',
      watch:         false,
      restart_delay: 5000,
      max_restarts:  10,
    },
  ]
}