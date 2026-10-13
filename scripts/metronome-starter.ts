import { runStarterFromCli } from '../src/server/metronomeStarter';

runStarterFromCli().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
