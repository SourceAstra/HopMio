import path from 'node:path';

export function windowsConfig(root, staging, packageInfo) {
  return {
    ...packageInfo.build,
    electronDist: path.join(root, 'node_modules/electron/dist'),
    directories: {
      app: path.join(staging, 'app'),
      output: path.join(staging, 'output'),
      buildResources: path.join(root, 'public/art/usagi'),
    },
    files: ['**/*'],
    npmRebuild: false,
    extraResources: [
      {
        from: path.join(root, 'backend'),
        to: 'backend',
        filter: ['**/*', '!**/__pycache__/**', '!**/*.pyc'],
      },
      { from: path.join(staging, 'python'), to: 'python' },
      { from: path.join(root, 'config'), to: 'config' },
      { from: path.join(staging, 'tools'), to: 'tools' },
    ],
    win: { ...packageInfo.build.win, icon: path.join(root, 'public/art/usagi/app-icon.ico') },
  };
}
