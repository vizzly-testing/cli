import { createInterface } from 'node:readline';

export function createPrompts({
  input = process.stdin,
  output = process.stderr,
} = {}) {
  let reader = createInterface({ input, crlfDelay: Infinity, terminal: false });
  let lines = reader[Symbol.asyncIterator]();
  let cancelled = () =>
    Object.assign(new Error('Setup cancelled.'), { code: 'INIT_CANCELLED' });
  let interrupted = false;
  let onInterrupt = () => {
    interrupted = true;
    reader.close();
  };
  process.on('SIGINT', onInterrupt);

  async function ask(question, fallback = '') {
    output.write(`${question}${fallback ? ` [${fallback}]` : ''}: `);
    let line = await lines.next();
    if (line.done || interrupted) throw cancelled();
    return line.value.trim() || fallback;
  }
  async function confirm(question, defaultYes = false) {
    while (true) {
      let answer = (
        await ask(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'}`)
      ).toLowerCase();
      if (!answer) return defaultYes;
      if (['y', 'yes'].includes(answer)) return true;
      if (['n', 'no'].includes(answer)) return false;
      output.write('Enter yes or no.\n');
    }
  }
  return {
    ask,
    confirm,
    close() {
      process.off('SIGINT', onInterrupt);
      reader.close();
    },
  };
}
