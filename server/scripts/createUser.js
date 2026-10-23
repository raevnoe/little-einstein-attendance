// Bootstrap tool: creates a Firebase Auth user, sets the authoritative `role`
// Custom Claim, and writes the matching users/{uid} document.
// Needed to create the first admin; after that, admins can use the Accounts screen.
// Uses the same createAccount() as POST /api/admin/users (audit actor: cli).
//
// Usage (from the project root):
//   npm run user:create -- --email a@b.com --password "Secret123" --first Ana --last Cruz --role admin
//   Parents may add --mobile 09171234567 (used for attendance SMS).
import { parseArgs } from 'node:util';
import { createAccount } from '../src/services/userAccount.service.js';
import { CLI_ACTOR } from '../src/services/audit.service.js';

const MIN_PASSWORD_LENGTH = 8;

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    first: { type: 'string' },
    last: { type: 'string' },
    role: { type: 'string' },
    mobile: { type: 'string' },
  },
});

async function main() {
  if (!values.password || values.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`--password is required (min ${MIN_PASSWORD_LENGTH} characters).`);
  }

  const user = await createAccount(
    { actor: CLI_ACTOR },
    { email: values.email, firstName: values.first, lastName: values.last, role: values.role, mobileNumber: values.mobile },
    { password: values.password },
  );

  console.log(`Created ${user.role} ${user.email} (uid: ${user.uid})`);
}

main().catch((err) => {
  console.error(`Failed to create user: ${err.message}`);
  process.exitCode = 1;
});
