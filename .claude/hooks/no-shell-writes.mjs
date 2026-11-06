#!/usr/bin/env node
// Written by Codittle (IDE ⇄ Claude bridge). Regenerated on every provision.
// Blocks shell commands that WRITE files, so file changes can only go through
// the IDE edit tool. Reading with cat/head/sed -n/grep is unaffected.
// Exit 2 = block the call and show this message to Claude.
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let cmd = '';
  try { cmd = String((JSON.parse(raw).tool_input || {}).command || ''); } catch { process.exit(0); }
  if (!cmd.trim()) process.exit(0);
  const PATTERNS = [
    [/\bpython3?\b[^|;&]*\s-c\b/i,                 'python -c'],
    [/\bperl\b[^|;&]*\s-[a-z]*[ie][a-z]*\b/i,       'perl -i'],
    [/\bsed\b[^|;&]*\s-[a-z]*i[a-z]*\b/i,           'sed -i'],
    [/\b(tee|dd)\b/i,                               'tee/dd'],
    [/\b(Set-Content|Add-Content|Out-File)\b/i,      'PowerShell file write'],
    [/>>?\s*[^\s|&>]+/,                               'shell redirection'],
    [/<<\s*['"]?[A-Za-z_]/,                           'heredoc'],
    [/\b(mv|cp)\b/i,                                 'mv/cp'],
    [/\btruncate\b/i,                                'truncate'],
  ];
  // A redirect to the null device or to a scratch/temp path isn't a file edit.
  const benign = /^[^>]*>\s*(\/dev\/null|\$null|NUL)\s*(2>&1)?\s*$/i.test(cmd)
    || /(\/tmp\/|\\Temp\\|\/scratchpad\/|\\scratchpad\\)/i.test(cmd);
  if (benign) process.exit(0);
  for (const [re, label] of PATTERNS) {
    if (re.test(cmd)) {
      process.stderr.write(
        'Blocked: this command writes files through the shell (' + label + ').\n' +
        'In this project file changes MUST go through the editor_propose_edit tool\n' +
        '(the codittle-ide MCP server). Reading with cat/head/grep/sed -n is fine.\n' +
        'If editor_propose_edit is unavailable, STOP and tell the user the IDE editor bridge is not connected.\n',
      );
      process.exit(2);
    }
  }
  process.exit(0);
});
