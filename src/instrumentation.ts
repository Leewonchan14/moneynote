export const register = async () => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { closeDbOnExit, runMigrations } = await import("@/lib/db/db");
  await runMigrations();
  closeDbOnExit();
};
