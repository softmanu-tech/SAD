<!-- CODITTLE_IDE_TOOLS:start -->
## You are running inside the Codittle IDE

This project is open in a live IDE (Monaco editor + a visual ReactFlow canvas).

### Editing files (REQUIRED)

The native **Edit, Write and NotebookEdit tools are DISABLED** here.
To change ANY file you MUST call **`editor_propose_edit`** (the `codittle-ide`
MCP server). It opens a Monaco diff for the user to Accept or Reject and writes
the file only on accept — this applies even when the user is in auto-accept mode.
There is no other way to modify files.

- Read the file first, then propose the change.
- For an existing file PREFER surgical `edits` (old_string→new_string hunks);
  use `newText` only for a new file or a full rewrite.
- Make focused, reviewable changes — the user reviews each as a diff.
- Do NOT route around this with the shell — no `python -c`, `sed -i`, `tee`,
  heredocs, `>`/`>>`, `Set-Content` or `Out-File` to write a file; a hook
  blocks them anyway. Reading with `cat`, `head`, `grep` or `sed -n` is fine.
- If `editor_propose_edit` is unavailable, STOP and tell the user the IDE
  editor bridge is not connected. Do not fall back to the shell.

### Other IDE tools

- **`editor_open_file`** — show a file to the user.
- **`editor_get_context`** — see the open file, selection and tabs.
- **`canvas_add_node`** / **`canvas_list_nodes`** — read/build the visual flow.
- **`walkthrough_brief`**: start here when asked to create or update a walkthrough
  (the whole project, a journey, or one routine). Then `walkthrough_read_document`
  for emails and Word files, `walkthrough_check`, and `walkthrough_write`, which
  saves into `_ctx/flows/` only when every stop lands on the code.

A tool works on what the person has on screen: the `canvas_*` tools need a
file open in the IDE, the `editor_*` tools an editor window.

### Diagnostics — how to work a question (standing doctrine)

This lived in the prompt of every investigation the RCA casebook opened —
two thousand characters of rules pushed through argv on each session, paid
for again every time, and invisible to a session started any other way. It
belongs here: read once, applies everywhere, whether the question came from
the casebook, a terminal, or a passing thought.

**Match the effort to the question.** Take the cheapest route that gets an
accurate answer and stop as soon as you have one. Someone who could have
web-searched it in a minute must not wait longer here. In cost order:

1. **Answer from what you know.** A general fact about the platform, the
   database or an error code is not an investigation. Give the likely cause,
   the one cheap check that confirms it, and the fix.
2. **`library_search`**, if it is in your tool list — a past lesson from this
   estate beats a general answer, and it is one call.
3. **This project's own records** — `CLAUDE.md`, `_ctx/`.
4. **The web**, when something genuinely needs research. Far cheaper than
   probing a live bank.
5. **The live estate, LAST**, and only when the answer depends on THIS
   estate's current state. Read before you act; ask before anything that
   writes, and before anything at all against a production connection.

**A missing tool ends a line of enquiry — it never starts one.** If a tool
you want is not in your list, say so in one line and carry on from your own
knowledge. Never go hunting for the data behind it: not in this app's
source, not on disk, not in a database. It is an MCP tool or it is nothing.

#### Writing back to an open case

When a case is open in the RCA casebook the `case_*` tools write onto the
page the human is reading. Anything you only say in the terminal is invisible
to them, and a finished investigation that left the page blank has failed.

- **`case_progress`** on each change of activity, and once with phase `done`.
- **`case_answer`** lands the answer, and is the one you almost always want:
  no citations needed, only an honest `basis` — what it rests on and what
  would confirm it. Answering from knowledge with nothing observed here is a
  good outcome; leaving the page blank because no box was reachable is not.
  **Keep it under 400 characters.** It is the headline of the page, set in display
  type — two or three sentences, not a report. Over-long answers are refused.
  Everything else has its own slot: ordered checks → `case_playbook`,
  candidates → `case_hypothesis`, the full write-up → a file in `_ctx/cases/`.
- **`case_hypothesis`** for EVERY candidate cause, as you think of them and
  BEFORE writing any of it up in prose. Candidates on the board beat a ranked
  list in a file nobody opens.
- **`case_evidence`** for anything you rely on; it returns the id the rest
  cites. A documented general fact counts — name its source rather than
  dressing reasoning up as an observation you did not make. Keep `note` to ONE
  line: it is a caption, not a paragraph.
- **`case_hypothesis_status`** once a check settles one; **`case_playbook`**
  if this could recur.
- **`case_verdict`** ONLY for causes confirmed against this estate. Otherwise
  use `case_answer` and leave the case open — do not inflate a knowledge-based
  answer into a verdict, and do not withhold it either.

### Collective intelligence (standing doctrine)

This device keeps a searchable memory of every past project and session.
Three rules apply to EVERY task here — they are what stop us re-fighting bugs
we already beat, and they cost almost nothing:

**1. Read before you fight.** Before debugging an unfamiliar error or
working out how something behaves, call **`library_search`** with the
distinctive part of the error text. If the user anchors the request to a
server ("on server .y…"), call **`library_env`** FIRST — the dossier often
already answers the question, and its facts carry an observed date so you
can say when something needs re-verifying. For "have we ever…" or "which X
have we handled" questions use **`library_digest`**.

**2. Write after you win.** The moment a fix is PROVEN — clean compile, remote
socket message accepted, test green, deploy landed, user confirms — call
**`library_record`**. Never record speculation, and never record while still
debugging: the value of this store is that everything in it was verified.
A few high-value records per session, not a running commentary.

- Write lessons ABSTRACTLY. Never name a bank, host, user or site — describe
  the condition instead ("on Java-runtime instances where <trait>…"). Text is
  sanitized automatically and the stored version is handed back to you; if
  sanitizing made it incoherent, rewrite it in general terms and record again.
- If the same symptom behaves DIFFERENTLY across two environments, that
  contrast usually means a version- or config-scoped cause: record the
  general lesson plus one `fact` per environment, linked.
- When a `library_search` hit from an old project lets you solve something,
  record the conclusion you drew, and pass the id of that hit as `solvedBy`.
  That promotes raw history into a verified lesson, and the credit is what
  ranks it for everyone later — a lesson that keeps solving real problems
  outranks one that was merely typed in often.

**3. Retract when you are wrong.** If a stored conclusion sends you down a
path that PROVES false — the fix does not work, the cause is not the cause —
call **`library_correct`** with the wrong id and what is actually true. Do
not just record a competing lesson beside it: both would then be served, and
the wrong one keeps being obeyed. The wrong entry is retired, not deleted, so
the next session is told "we believed X, it is actually Y" instead of
re-deriving the same mistake from the same symptom. This rule matters more
than rule 2: an unretracted mistake is followed by every future session, and
the more this knowledge is distilled into standing instructions, the more a
single wrong lesson costs.

### Project conventions

- If `_ctx/runbook.md` is present, read it first — it carries this project's
  workflow and cautions (sync/deploy, binary artifacts, immutable `I_*`
  inserts).
- Stay release-agnostic: never hardcode a customer/site's names, BP/routine
  names, host IPs or install paths in code, comments or examples — use neutral
  placeholders (`CUSTOM.BP`, `/path/to/server`, `<home>`).

### Live remote shell tools (this machine)

You can drive the core banking servers directly. Connections come from
`list_connections`: this project's servers (name, env class, and the remote
socket channels added for each, by name). Read first
(`read_record`, `grep_remote`, `version_get`,
`check_app_db`), then act. A typical loop: deploy a routine → read the
compile/run failure → fix → redeploy; or get a VERSION → add a validation
routine → send in VALIDATE mode → if the response is clean, send in PROCESS.

**Sending remote socket messages (including pasted ones).** When the user
pastes one or more socket messages and names a target and a service:
- Resolve the connection with `list_connections`, matching the target the
  user named. Each connection reports `remoteSocketServices`: the names of the
  channels added for that box. Those names are the ONLY valid
  values, and there are no defaults or well-known ones here, so never
  supply a service name that is not in that list. If the list is empty,
  say so and ask the user.
- Then call `remote_socket_send` once per message with `rawRemoteSocket` = the pasted line and
  `service` = the declared name, copied exactly.
- **Credentials:** any user/password embedded in a pasted message is IGNORED —
  the human's sign-on is always used (a login popup appears if not cached).
  NEVER put credentials in your arguments, and NEVER ask the user to paste an
  application password to you.
- VALIDATE when unsure; PROCESS commits and asks the user to confirm. If the
  user names a service that is not in the declared list, ASK which of the
  declared ones they mean; never guess a name or a port.
- If a send fails to connect, the internal socket port or JBoss may be down.
  TELL the user to restart it (or refresh that port in Amethyst) and retry —
  do NOT loop, and do NOT try other ports.

**sudo in `run_command`.** Only when "Allow sudo in run command" is on in
Settings → User → AI → Remote shell tools; if the tool says it is off, tell the user where to
turn it on and stop. Every sudo command stops for the human to approve it,
then the human's sudo password is used (cached after the first prompt, never
shown to you). NEVER put a password in the command, never pipe one into sudo,
and never ask the user to paste a sudo password to you.
- **One failure halts sudo on that connection.** If a sudo command fails
  (wrong password, no tty, not a sudoer), the tool refuses further sudo there.
  Do NOT retry, rephrase or work around it. Tell the user exactly what
  happened and what it likely means. Only if the user EXPLICITLY asks you to
  try again, call run_command with `retrySudo: true`.

- **Wire framing is automatic.** Long socket messages are truncated by the
  server unless wrapped in `<MSG></MSG>`; the sender adds the tags per the
  channel's policy and reports `msgTagged` in the result. Do NOT add the
  tags yourself, and do not split a long message to avoid truncation.

Enabled remote shell tools: `list_connections`, `read_record`, `grep_remote`, `fetch_remote_file`, `check_app_db`, `fleet_status`, `version_get`, `run_command`, `remote_socket_send`, `deploy_routine`.
<!-- CODITTLE_IDE_TOOLS:end -->
