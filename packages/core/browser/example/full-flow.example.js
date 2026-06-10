import { ApiProject } from '../api/ApiProject.js';
import { ApiTask } from '../api/ApiTask.js';
import { ApiEvent } from '../api/ApiEvent.js';

/**
 * Przykład pełnego przepływu: projekt → zadanie → wydarzenie powiązane z zadaniem.
 * @param {import('../api/ApiClient.js').ApiClient} client
 * @param {(...args:any[])=>void} log
 */
export async function runFullFlowExample(client, log = console.log) {
  const projects = new ApiProject(client);
  const tasks = new ApiTask(client);
  const events = new ApiEvent(client);
  log('— Full flow: project → task → event —');

  const prj = await projects.create({ name: 'Remont kuchni' });
  log('project:', prj.name, prj.id);

  const task = await tasks.create({ name: 'Malowanie', projectId: prj.id, duration: 8 });
  log('task:', task.name, '-> project', task.projectId);

  const day = '2026-06-15';
  const ev = await events.add(day, {
    name: `Praca: ${task.name}`,
    taskId: task.id,
    startTime: `${day}T08:00:00`,
    endTime: `${day}T16:00:00`,
  });
  log('event:', ev.name, '| taskId:', ev.taskId, '| duration:', ev.getDurationFormatted(), '| range:', ev.getTimeRange());

  // sprzątanie
  await events.clearDay(day);
  await tasks.remove(task.id);
  await projects.remove(prj.id);
  log('done & cleaned up');
}
