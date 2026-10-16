import { execFileSync } from 'node:child_process';

/** Windows taskkill /T can stall in restricted environments. Stop Vite itself first.
 * reuseExistingServer:false makes this listener exclusive to this Playwright run.
 */
export default function stopWindowsVite(): void {
  if (process.platform !== 'win32') return;
  const connections = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
    encoding: 'utf8', windowsHide: true, timeout: 5000
  });
  const pids = new Set(connections.split(/\r?\n/).map(line => line.trim().split(/\s+/))
    .filter(fields => fields[1] === '127.0.0.1:5181' && fields[3] === 'LISTENING')
    .map(fields => Number(fields[4])).filter(pid => Number.isSafeInteger(pid) && pid > 0));
  for (const pid of pids) {
    try { process.kill(pid); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  }
}
