const { execFileSync } = require('node:child_process');

const expectedBranch = process.env.EXPECTED_BRANCH;
const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA || 'HEAD';

if (!expectedBranch) {
  console.error('ERROR: EXPECTED_BRANCH was not provided.');
  process.exit(1);
}

const hasValidBase = baseSha && !/^0+$/.test(baseSha);
const revision = hasValidBase ? baseSha + '..' + headSha : headSha;
const args = hasValidBase
  ? ['log', '--format=%s', revision]
  : ['log', '-1', '--format=%s', revision];
const messages = execFileSync('git', args, { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);
const invalidMessages = messages.filter(
  (message) => message.trim() !== expectedBranch,
);

if (invalidMessages.length > 0) {
  console.error(
    'ERROR: Every commit message must exactly match the branch name: ' +
      expectedBranch,
  );
  for (const message of invalidMessages) {
    console.error('Invalid message: ' + message);
  }
  process.exit(1);
}

console.log(
  'Validated ' + messages.length + ' commit message(s) for ' + expectedBranch,
);
