// Small helpers shared by the demo modules of chapters 21-30 (slot b). Not a demo module itself (no default export).

/** Jobs get a fixed id in the chapters that need to open a job page by address (/jobs/<id>#subs) after a route change. */
export const NAIR_ID = '5b0b0000-0000-4000-8000-00000000a001';
export const WHITFIELD_ID = '5b0b0000-0000-4000-8000-00000000a002';

/** Gives a job a new id and repoints every row that names it (documents, photos, tasks, appointments...). */
export function pinJob(tables, job, newId) {
  if (!job || job.id === newId) return;
  const old = job.id;
  for (const rows of tables.values()) for (const r of rows) if (r && r.job_id === old) r.job_id = newId;
  job.id = newId;
}

export const pinJobs = (tables) => {
  const jobs = tables.get('jobs');
  pinJob(tables, jobs.find((j) => j.name === 'Nair Master Bath'), NAIR_ID);
  pinJob(tables, jobs.find((j) => j.name === 'Whitfield Kitchen Remodel'), WHITFIELD_ID);
};

export const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));
