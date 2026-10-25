// Demo cleanup: removes ALL test records and every account that is not on the keep list.
// Runs on your computer with the server's Firebase Admin credentials (server/.env). There is no
// way to start it from the app.
//
// 1. Dry run (changes nothing; shows what would be deleted):
//      npm run data:reset -w server -- --keep admin@school.ph,teacher@school.ph
// 2. Real run (writes a JSON backup to server/backups/ first, then deletes):
//      npm run data:reset -w server -- --keep admin@school.ph,teacher@school.ph --confirm "DELETE TEST DATA"
//
// The backup contains personal data: keep it private (server/backups/ is git-ignored) and delete it
// once you are sure you do not need it.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { RESET_CONFIRM_PHRASE, planReset, runReset } from '../src/services/dataReset.service.js';

const { values } = parseArgs({ options: { keep: { type: 'string' }, confirm: { type: 'string' } } });

function printPlan(plan) {
  console.log(`\nFirebase project: ${plan.projectId ?? '(unknown)'}`);
  console.log(`\nAccounts KEPT (${plan.kept.length}):`);
  for (const k of plan.kept) console.log(`  keep    ${k.role.padEnd(8)} ${k.email}`);
  console.log(`\nAccounts DELETED (${plan.deleted.length} profiles, ${plan.deletedAuthUids.length} sign-ins):`);
  for (const d of plan.deleted) console.log(`  delete  ${String(d.role).padEnd(8)} ${d.email}`);
  console.log('\nRecords DELETED:');
  for (const [name, count] of Object.entries(plan.collections)) console.log(`  ${name.padEnd(18)} ${count}`);
  console.log(`  ${'notification bells'.padEnd(18)} ${plan.inboxItems}`);
  console.log(`  ${'section list'.padEnd(18)} ${plan.sectionList ? 'yes' : 'none'}`);
  console.log('\nKept: the accounts above (role, name, email, parent mobile number) and the attendance/dismissal settings.');
}

async function main() {
  const plan = await planReset({ keepEmails: (values.keep ?? '').split(',') });
  printPlan(plan);

  if (values.confirm !== RESET_CONFIRM_PHRASE) {
    console.log(`\nDRY RUN - nothing was changed. To delete, run again with: --confirm "${RESET_CONFIRM_PHRASE}"`);
    return;
  }

  const dir = fileURLToPath(new URL('../backups/', import.meta.url));
  await mkdir(dir, { recursive: true });
  const backupPath = join(dir, `reset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  console.log('\nDeleting...');
  await runReset(plan, { backupPath, log: (line) => console.log(`  ${line}`) });
  console.log('\nDone. Register the RFID cards and add the students again for the demo.');
}

main().catch((err) => {
  console.error(`\nReset stopped: ${err.message}`);
  process.exitCode = 1;
});
