// Where the big, regenerable files live (recorded frames, audio, videos): OUTSIDE the project folder on purpose.
// Vite's file watcher (the app's dev server) otherwise sees every one of the thousands of frames and gets very slow.
// Override with the TUTORIAL_WORK_DIR environment variable.
import os from 'node:os';
import path from 'node:path';

export const WORK = process.env.TUTORIAL_WORK_DIR || path.join(os.homedir(), 'contractordocs-tutorial-work');
export const OUT = path.join(WORK, 'out');
export const CACHE = path.join(WORK, 'cache');
