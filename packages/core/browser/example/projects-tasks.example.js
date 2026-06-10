import { ApiProject } from '../api/ApiProject.js';
import { ApiTask } from '../api/ApiTask.js';

/**
 * Przykład: projekt z zadaniami (linkowanie przez projectId).
 * @param {import('../api/ApiClient.js').ApiClient} client
 * @param {(...args:any[])=>void} log
 */
export async function runProjectsTasksExample(client, log = console.log) {
  const projects = new ApiProject(client);
  const tasks = new ApiTask(client);
  log('— Projects & Tasks —');

  // projekt
  const house = await projects.create({ name: 'Dom', description: 'Budowa domu' });
  log('project created:', house.id, '->', house.name);

  // zadania powiązane z projektem
  const t1 = await tasks.create({ name: 'Fundamenty', projectId: house.id, duration: 40, cost: 1000 });
  const t2 = await tasks.create({
    name: 'Dach', projectId: house.id, duration: 30, cost: 2000,
    components: [{ type: 'task_interval', daysInterval: 7 }],
  });
  log('tasks created:', t1.name, '/', t2.name);

  // zadania danego projektu
  const projTasks = await tasks.listByProject(house.id);
  log('tasks in project:', projTasks.map((t) => `${t.name} (${t.getDurationFormatted()}, ${t.getCostFormatted()})`));
  log('interval "Dach":', t2.getDaysIntervalFormatted());

  // update
  await tasks.update(t1.id, { cost: 1500 });
  log('updated "Fundamenty" cost ->', (await tasks.get(t1.id))?.getCostFormatted());

  // sprzątanie
  await tasks.remove(t1.id);
  await tasks.remove(t2.id);
  await projects.remove(house.id);
  log('cleaned up. projects:', (await projects.list()).length, 'tasks:', (await tasks.list()).length);

  return house;
}
