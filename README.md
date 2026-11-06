# SAD: Salary Advance Manager

Tracks staff salary advances under the company Salary Advance Policy: requests (typed in or read from an
uploaded Loan Application Form PDF), automatic policy checks before approval, repayment schedules,
payroll-month deductions, and a printable loan application form.

It runs in two ways:

| | On one laptop | Online (Vercel) |
|---|---|---|
| Start | double-click `start.bat` | open your Vercel address |
| Records | `data/` folder on the laptop | Neon Postgres database |
| Sign in | none: only that laptop can open it | named people, each with their own password |

## On one laptop

Install Node.js, then double-click `start.bat`. It installs, builds and opens `http://127.0.0.1:3500`.
Keep the black window open while using the app. The `data/` folder holds the records and is never committed.

## Online on Vercel

1. **Add the database.** In the Vercel project, open **Storage → Create Database → Neon** and connect it to
   this project. This sets `DATABASE_URL` automatically.
2. **Add these settings** under **Settings → Environment Variables** (Production):

   | Name | Value |
   |---|---|
   | `SESSION_SECRET` | a long random value, at least 32 characters (e.g. from a password generator) |
   | `ADMIN_EMAIL` | the first person's email, e.g. the boss |
   | `ADMIN_PASSWORD` | their starting password, at least 10 characters |
   | `ADMIN_NAME` | their name as shown in the app (optional) |

3. **Redeploy** (Deployments → ⋯ → Redeploy) so the settings take effect.
4. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Add the other people on the **Users** tab and give each
   of them their starting password in person.

`ADMIN_EMAIL` / `ADMIN_PASSWORD` are only used to create the first account when there are no users yet.
After that, passwords are changed on the Users tab, and changing the environment variable does nothing.

### Security notes

- Passwords are stored hashed (scrypt). Sessions last 12 hours; signing out, a password reset or removing
  a person ends their sessions.
- After 5 wrong passwords an account is locked for 15 minutes.
- Uploaded application PDFs are stored in the database and are only served to signed-in people.
- A copy of all records is kept in the database each day (`sa_backups`); Neon can also restore to an
  earlier point in time.
- Uploaded PDFs are limited to 4 MB online.
