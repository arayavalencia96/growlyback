const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const commands = [
  {
    name: 'Lint',
    executable: join('node_modules', 'eslint', 'bin', 'eslint.js'),
    args: ['{src,apps,libs,test}/**/*.ts'],
  },
  {
    name: 'Unit tests',
    executable: join('node_modules', 'jest', 'bin', 'jest.js'),
    args: ['--runInBand', '--passWithNoTests'],
  },
];

for (const command of commands) {
  console.log('\n[pre-commit] ' + command.name);
  const result = spawnSync(
    process.execPath,
    [command.executable, ...command.args],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
    },
  );

  if (result.error) {
    console.error('[pre-commit] ' + command.name + ' could not start.');
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error('[pre-commit] ' + command.name + ' failed.');
    process.exit(result.status ?? 1);
  }
}
