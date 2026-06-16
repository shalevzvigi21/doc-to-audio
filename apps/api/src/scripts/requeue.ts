import { conversionQueue } from "../queue/conversionQueue.js";
import { prisma } from "../lib/prisma.js";

/**
 * One-off: re-enqueue the most recent non-DONE file for conversion.
 * Used to recover jobs that were orphaned (stalled) by a worker restart.
 */
async function main(): Promise<void> {
  const file = await prisma.file.findFirst({
    where: { status: { not: "DONE" } },
    orderBy: { createdAt: "desc" },
  });
  if (!file) {
    console.log("No non-DONE file to requeue.");
    return;
  }

  await prisma.file.update({ where: { id: file.id }, data: { status: "PENDING" } });
  await prisma.audioJob
    .update({ where: { fileId: file.id }, data: { progress: 0 } })
    .catch(() => undefined);

  const job = await conversionQueue.add("convert", { fileId: file.id, userId: file.userId });
  console.log(`Requeued file ${file.id} (${file.name}) as job ${job.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
