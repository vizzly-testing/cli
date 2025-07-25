import { createColors } from 'colorette';

/**
 * Simple console UI utilities for CLI output
 */
export class ConsoleUI {
  constructor(options = {}) {
    this.colors = createColors({ useColor: options.color !== false });
    this.json = options.json || false;
    this.verbose = options.verbose || false;
    this.spinner = null;
    this.lastLine = '';
  }

  /**
   * Show a success message
   */
  success(message, data = {}) {
    this.stopSpinner();
    if (this.json) {
      console.log(
        JSON.stringify({
          status: 'success',
          message,
          timestamp: new Date().toISOString(),
          ...data,
        })
      );
    } else {
      console.log(this.colors.green(`✓ ${message}`));
    }
  }

  /**
   * Show an error message and exit
   */
  error(message, error = {}, exitCode = 1) {
    this.stopSpinner();
    if (this.json) {
      const errorData = {
        status: 'error',
        message,
        timestamp: new Date().toISOString(),
      };

      if (error instanceof Error) {
        errorData.error = {
          name: error.name,
          message: error.message,
          ...(this.verbose && { stack: error.stack }),
        };
      } else if (typeof error === 'object') {
        errorData.error = error;
      }

      console.error(JSON.stringify(errorData));
    } else {
      console.error(this.colors.red(`✖ ${message}`));
      if (this.verbose && error.stack) {
        console.error(this.colors.dim(error.stack));
      }
    }

    if (exitCode > 0) {
      process.exit(exitCode);
    }
  }

  /**
   * Show an info message
   */
  info(message, data = {}) {
    if (this.json) {
      console.log(
        JSON.stringify({
          status: 'info',
          message,
          timestamp: new Date().toISOString(),
          ...data,
        })
      );
    } else {
      console.log(this.colors.cyan(`ℹ ${message}`));
    }
  }

  /**
   * Show a warning message
   */
  warning(message, data = {}) {
    if (this.json) {
      console.log(
        JSON.stringify({
          status: 'warning',
          message,
          timestamp: new Date().toISOString(),
          ...data,
        })
      );
    } else {
      console.log(this.colors.yellow(`⚠ ${message}`));
    }
  }

  /**
   * Show progress with spinner
   */
  progress(message, current = 0, total = 0) {
    if (this.json) {
      console.log(
        JSON.stringify({
          status: 'progress',
          message,
          progress: { current, total },
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      this.updateSpinner(message, current, total);
    }
  }

  /**
   * Output structured data
   */
  data(data) {
    if (this.json) {
      console.log(
        JSON.stringify({
          status: 'data',
          data,
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  /**
   * Start a spinner with message
   */
  startSpinner(message) {
    if (this.json || !process.stdout.isTTY) return;

    this.stopSpinner();

    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;

    this.spinner = setInterval(() => {
      const frame = frames[i++ % frames.length];
      const line = `${this.colors.blue(frame)} ${message}`;

      // Clear previous line and write new one
      process.stdout.write('\r' + ' '.repeat(this.lastLine.length) + '\r');
      process.stdout.write(line);
      this.lastLine = line;
    }, 80);
  }

  /**
   * Update spinner message and progress
   */
  updateSpinner(message, current = 0, total = 0) {
    if (this.json || !process.stdout.isTTY) return;

    if (!this.spinner) {
      this.startSpinner(message);
      return;
    }

    const progressText = total > 0 ? ` (${current}/${total})` : '';
    const fullMessage = `${message}${progressText}`;

    // The spinner will pick up the new message on next frame
    this.currentMessage = fullMessage;
  }

  /**
   * Stop the spinner
   */
  stopSpinner() {
    if (this.spinner) {
      clearInterval(this.spinner);
      this.spinner = null;

      // Clear the spinner line
      if (process.stdout.isTTY) {
        process.stdout.write('\r' + ' '.repeat(this.lastLine.length) + '\r');
      }
      this.lastLine = '';
    }
  }

  /**
   * Clean up on exit
   */
  cleanup() {
    this.stopSpinner();
  }
}

// Ensure spinner is cleaned up on process exit
process.on('exit', () => {
  // Clear any remaining spinner
  if (process.stdout.isTTY) {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }
});

process.on('SIGINT', () => {
  if (process.stdout.isTTY) {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }
  process.exit(1);
});
