import readline from "node:readline";

/** Ask a question, echoing what is typed. */
export function ask(question: string, fallback = ""): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim() || fallback);
    });
  });
}

/**
 * Ask for a secret without echoing it.
 *
 * Node's readline has no silent mode, so the output writer is replaced for the
 * duration. Without this the password lands in the terminal scrollback and in
 * any recording of the session.
 */
export function askSecret(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const muted = rl as unknown as { _writeToOutput: (chunk: string) => void };
  const original = muted._writeToOutput.bind(rl);
  let muting = false;
  muted._writeToOutput = (chunk: string) => {
    if (!muting) original(chunk);
  };

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      muting = false;
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muting = true;
  });
}

export async function confirm(question: string): Promise<boolean> {
  const answer = await ask(`${question} [Y/n] `, "y");
  return /^y(es)?$/i.test(answer);
}
