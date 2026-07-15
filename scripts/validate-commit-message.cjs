const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

const commitMessagePath = process.argv[2];

if (!commitMessagePath) {
  console.error('ERROR: Commit message file was not provided.');
  process.exit(1);
}

const branchName = execFileSync('git', ['branch', '--show-current'], {
  encoding: 'utf8',
}).trim();
const commitMessage = readFileSync(commitMessagePath, 'utf8')
  .split(/\r?\n/, 1)[0]
  .trim();

if (!branchName) {
  console.error('ERROR: Cannot validate a commit in detached HEAD state.');
  process.exit(1);
}

if (commitMessage !== branchName) {
  console.error(
    'ERROR: The commit message must exactly match the branch name.',
  );
  console.error('Branch:  ' + branchName);
  console.error('Message: ' + commitMessage);
  process.exit(1);
}
