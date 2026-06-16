import * as Y from 'yjs';
import { Section } from '@features/projects/domain/entities/section.entity';
import { Task } from '@features/projects/domain/entities/task.entity';

export const PROJECT_SCHEMA_VERSION = 1;

export interface ProjectMeta {
  name: string;
  favorite: boolean;
  schemaVersion: number;
}

export class YProjectDocument {
  private constructor(private readonly doc: Y.Doc) {}

  static create(name: string, favorite: boolean): YProjectDocument {
    const doc = new Y.Doc();
    const wrapper = new YProjectDocument(doc);
    doc.getMap('meta').set('schemaVersion', PROJECT_SCHEMA_VERSION);
    wrapper.setMeta({ name, favorite });
    return wrapper;
  }

  static load(state: Uint8Array): YProjectDocument {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    return new YProjectDocument(doc);
  }

  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  getMeta(): ProjectMeta {
    const meta = this.doc.getMap('meta');
    const context = `YProjectDocument(doc=${this.doc.guid})`;

    if (!meta.has('name')) {
      throw new Error(`${context}: meta.name is missing`);
    }
    const name = meta.get('name');
    if (typeof name !== 'string') {
      throw new Error(`${context}: meta.name must be a string, got ${typeof name}`);
    }

    if (!meta.has('favorite')) {
      throw new Error(`${context}: meta.favorite is missing`);
    }
    const favorite = meta.get('favorite');
    if (typeof favorite !== 'boolean') {
      throw new Error(`${context}: meta.favorite must be a boolean, got ${typeof favorite}`);
    }

    if (!meta.has('schemaVersion')) {
      throw new Error(`${context}: meta.schemaVersion is missing`);
    }
    const schemaVersion = meta.get('schemaVersion');
    if (typeof schemaVersion !== 'number') {
      throw new Error(`${context}: meta.schemaVersion must be a number, got ${typeof schemaVersion}`);
    }

    return { name, favorite, schemaVersion };
  }

  setMeta(meta: Partial<Pick<ProjectMeta, 'name' | 'favorite'>>): void {
    const map = this.doc.getMap('meta');
    if (meta.name !== undefined) {
      map.set('name', meta.name);
    }
    if (meta.favorite !== undefined) {
      map.set('favorite', meta.favorite);
    }
  }

  getSectionOrder(): string[] {
    const sectionOrder = this.doc.getArray<string>('sectionOrder');
    return sectionOrder.toArray();
  }

  getSections(projectId: string): Section[] {
    const sectionOrder = this.getSectionOrder();
    const sectionsMap = this.doc.getMap('sections');

    return sectionOrder.map((sectionId) => {
      const sectionMap = sectionsMap.get(sectionId);
      if (!(sectionMap instanceof Y.Map)) {
        throw new Error(
          `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" is missing or not a Y.Map`,
        );
      }

      const name = this.readSectionName(sectionId, sectionMap);
      const taskOrder = this.readTaskOrder(sectionId, sectionMap);

      return new Section(sectionId, name, projectId, taskOrder);
    });
  }

  createSection(section: Section): void {
    const sectionOrder = this.doc.getArray<string>('sectionOrder');
    const sectionsMap = this.doc.getMap('sections');

    if (sectionsMap.has(section.id)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${section.id}" already exists`,
      );
    }

    const sectionMap = new Y.Map<unknown>();
    sectionMap.set('name', section.name);
    sectionMap.set('taskOrder', Y.Array.from([...section.taskIds]));

    sectionsMap.set(section.id, sectionMap);
    sectionOrder.push([section.id]);
  }

  updateSection(sectionId: string, name: string): void {
    const sectionMap = this.getSectionMap(sectionId);
    sectionMap.set('name', name);
  }

  deleteSection(sectionId: string): void {
    const sectionOrder = this.doc.getArray<string>('sectionOrder');
    const sectionsMap = this.doc.getMap('sections');

    const index = sectionOrder.toArray().indexOf(sectionId);
    if (index === -1) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" not found in sectionOrder`,
      );
    }

    sectionOrder.delete(index, 1);
    sectionsMap.delete(sectionId);
  }

  private getSectionMap(sectionId: string): Y.Map<unknown> {
    const sectionsMap = this.doc.getMap('sections');
    const sectionMap = sectionsMap.get(sectionId);

    if (!(sectionMap instanceof Y.Map)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" is missing or not a Y.Map`,
      );
    }

    return sectionMap;
  }

  private readSectionName(sectionId: string, sectionMap: Y.Map<unknown>): string {
    if (!sectionMap.has('name')) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" name is missing`,
      );
    }

    const name = sectionMap.get('name');
    if (typeof name !== 'string') {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" name must be a string, got ${typeof name}`,
      );
    }

    return name;
  }

  private readTaskOrder(sectionId: string, sectionMap: Y.Map<unknown>): string[] {
    if (!sectionMap.has('taskOrder')) {
      return [];
    }

    const taskOrder = sectionMap.get('taskOrder');
    if (!(taskOrder instanceof Y.Array)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" taskOrder must be a Y.Array`,
      );
    }

    const taskIds = taskOrder.toArray();
    for (let index = 0; index < taskIds.length; index++) {
      const taskId = taskIds[index];
      if (typeof taskId !== 'string') {
        throw new Error(
          `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" taskOrder[${index}] must be a string, got ${typeof taskId}`,
        );
      }
    }

    return taskIds;
  }

  getTasks(): Task[] {
    const tasksMap = this.doc.getMap('tasks');
    const tasks: Task[] = [];

    tasksMap.forEach((value, taskId) => {
      if (!(value instanceof Y.Map)) {
        throw new Error(
          `YProjectDocument(doc=${this.doc.guid}): task "${taskId}" is missing or not a Y.Map`,
        );
      }

      tasks.push(this.readTask(taskId, value));
    });

    return tasks;
  }

  findTask(taskId: string): Task | undefined {
    const taskMap = this.doc.getMap('tasks').get(taskId);
    if (!(taskMap instanceof Y.Map)) {
      return undefined;
    }

    return this.readTask(taskId, taskMap);
  }

  createTask(task: Task): void {
    const tasksMap = this.doc.getMap('tasks');

    if (tasksMap.has(task.id)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): task "${task.id}" already exists`,
      );
    }

    const taskMap = this.writeTaskMap(task);
    tasksMap.set(task.id, taskMap);

    if (task.parentTaskId) {
      const parentMap = this.getTaskMap(task.parentTaskId);
      const subtaskOrder = this.getSubtaskOrderArray(task.parentTaskId, parentMap);
      subtaskOrder.push([task.id]);
    } else {
      const sectionMap = this.getSectionMap(task.sectionId);
      const taskOrder = this.getTaskOrderArray(task.sectionId, sectionMap);
      taskOrder.push([task.id]);
    }
  }

  updateTask(task: Task): void {
    const taskMap = this.getTaskMap(task.id);
    this.applyTaskFields(taskMap, task);
  }

  completeTask(taskId: string, completedDate: Date): void {
    const taskMap = this.getTaskMap(taskId);
    taskMap.set('completed', true);
    taskMap.set(
      'completedDate',
      this.dateToEpochMs(completedDate, `task "${taskId}" completedDate`),
    );
  }

  uncompleteTask(taskId: string): void {
    const taskMap = this.getTaskMap(taskId);
    taskMap.set('completed', false);
    taskMap.delete('completedDate');
  }

  deleteTask(taskId: string): void {
    const taskMap = this.getTaskMap(taskId);
    const sectionId = this.readRequiredString(taskId, 'sectionId', taskMap.get('sectionId'));
    const parentTaskId = this.readOptionalString(taskId, 'parentTaskId', taskMap.get('parentTaskId'));

    if (parentTaskId) {
      const parentMap = this.getTaskMap(parentTaskId);
      this.removeIdFromArray(
        this.getSubtaskOrderArray(parentTaskId, parentMap),
        taskId,
        `task "${parentTaskId}" subtaskOrder`,
      );
    } else {
      const sectionMap = this.getSectionMap(sectionId);
      this.removeIdFromArray(
        this.getTaskOrderArray(sectionId, sectionMap),
        taskId,
        `section "${sectionId}" taskOrder`,
      );
    }

    this.doc.getMap('tasks').delete(taskId);
  }

  private getTaskMap(taskId: string): Y.Map<unknown> {
    const taskMap = this.doc.getMap('tasks').get(taskId);

    if (!(taskMap instanceof Y.Map)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): task "${taskId}" is missing or not a Y.Map`,
      );
    }

    return taskMap;
  }

  private writeTaskMap(task: Task): Y.Map<unknown> {
    const taskMap = new Y.Map<unknown>();
    this.applyTaskFields(taskMap, task);
    return taskMap;
  }

  private applyTaskFields(taskMap: Y.Map<unknown>, task: Task): void {
    taskMap.set('sectionId', task.sectionId);
    taskMap.set('name', task.name);
    taskMap.set('completed', task.completed);
    taskMap.set('subtaskOrder', Y.Array.from([...task.subtaskIds]));

    this.setOptionalString(taskMap, 'description', task.description);
    this.setOptionalString(taskMap, 'label', task.label);
    this.setOptionalString(taskMap, 'parentTaskId', task.parentTaskId);
    this.setOptionalEpochMs(taskMap, 'startDate', task.startDate);
    this.setOptionalEpochMs(taskMap, 'endDate', task.endDate);
    this.setOptionalEpochMs(taskMap, 'completedDate', task.completedDate);
  }

  private readTask(taskId: string, taskMap: Y.Map<unknown>): Task {
    const sectionId = this.readRequiredString(taskId, 'sectionId', taskMap.get('sectionId'));
    const name = this.readRequiredString(taskId, 'name', taskMap.get('name'));
    const completed = this.readRequiredBoolean(taskId, 'completed', taskMap.get('completed'));
    const description = this.readOptionalString(taskId, 'description', taskMap.get('description'));
    const label = this.readOptionalString(taskId, 'label', taskMap.get('label'));
    const parentTaskId = this.readOptionalString(taskId, 'parentTaskId', taskMap.get('parentTaskId'));
    const startDate = this.readOptionalEpochMs(taskId, 'startDate', taskMap.get('startDate'));
    const endDate = this.readOptionalEpochMs(taskId, 'endDate', taskMap.get('endDate'));
    const completedDate = this.readOptionalEpochMs(taskId, 'completedDate', taskMap.get('completedDate'));
    const subtaskIds = this.readSubtaskOrder(taskId, taskMap);

    return new Task(
      taskId,
      sectionId,
      name,
      completed,
      startDate,
      description,
      label,
      endDate,
      completedDate,
      parentTaskId,
      subtaskIds,
    );
  }

  private getTaskOrderArray(sectionId: string, sectionMap: Y.Map<unknown>): Y.Array<string> {
    const taskOrder = sectionMap.get('taskOrder');
    if (!(taskOrder instanceof Y.Array)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): section "${sectionId}" taskOrder must be a Y.Array`,
      );
    }

    return taskOrder;
  }

  private getSubtaskOrderArray(taskId: string, taskMap: Y.Map<unknown>): Y.Array<string> {
    if (!taskMap.has('subtaskOrder')) {
      const subtaskOrder = new Y.Array<string>();
      taskMap.set('subtaskOrder', subtaskOrder);
      return subtaskOrder;
    }

    const subtaskOrder = taskMap.get('subtaskOrder');
    if (!(subtaskOrder instanceof Y.Array)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): task "${taskId}" subtaskOrder must be a Y.Array`,
      );
    }

    return subtaskOrder;
  }

  private readSubtaskOrder(taskId: string, taskMap: Y.Map<unknown>): string[] {
    if (!taskMap.has('subtaskOrder')) {
      return [];
    }

    const subtaskOrder = taskMap.get('subtaskOrder');
    if (!(subtaskOrder instanceof Y.Array)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): task "${taskId}" subtaskOrder must be a Y.Array`,
      );
    }

    const subtaskIds = subtaskOrder.toArray();
    for (let index = 0; index < subtaskIds.length; index++) {
      const subtaskId = subtaskIds[index];
      if (typeof subtaskId !== 'string') {
        throw new Error(
          `YProjectDocument(doc=${this.doc.guid}): task "${taskId}" subtaskOrder[${index}] must be a string, got ${typeof subtaskId}`,
        );
      }
    }

    return subtaskIds;
  }

  private removeIdFromArray(array: Y.Array<string>, id: string, context: string): void {
    const index = array.toArray().indexOf(id);
    if (index === -1) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): "${id}" not found in ${context}`,
      );
    }

    array.delete(index, 1);
  }

  private setOptionalString(taskMap: Y.Map<unknown>, key: string, value: string | undefined): void {
    if (value === undefined) {
      taskMap.delete(key);
      return;
    }

    taskMap.set(key, value);
  }

  private setOptionalEpochMs(taskMap: Y.Map<unknown>, key: string, value: Date | undefined): void {
    if (value === undefined) {
      taskMap.delete(key);
      return;
    }

    taskMap.set(key, this.dateToEpochMs(value, `task field "${key}"`));
  }

  private dateToEpochMs(date: Date, context: string): number {
    return this.assertValidEpochMs(date.getTime(), context);
  }

  private assertValidEpochMs(epochMs: number, context: string): number {
    if (!Number.isFinite(epochMs)) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): ${context} must be a finite timestamp, got ${epochMs}`,
      );
    }

    return epochMs;
  }

  private readRequiredString(taskId: string, field: string, value: unknown): string {
    if (value === undefined || value === null) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): task "${taskId}" ${field} is missing`,
      );
    }

    if (typeof value !== 'string') {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): task "${taskId}" ${field} must be a string, got ${typeof value}`,
      );
    }

    return value;
  }

  private readOptionalString(taskId: string, field: string, value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): task "${taskId}" ${field} must be a string, got ${typeof value}`,
      );
    }

    return value;
  }

  private readRequiredBoolean(taskId: string, field: string, value: unknown): boolean {
    if (value === undefined || value === null) {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): task "${taskId}" ${field} is missing`,
      );
    }

    if (typeof value !== 'boolean') {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): task "${taskId}" ${field} must be a boolean, got ${typeof value}`,
      );
    }

    return value;
  }

  private readOptionalEpochMs(taskId: string, field: string, value: unknown): Date | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'number') {
      throw new Error(
        `YProjectDocument(doc=${this.doc.guid}): task "${taskId}" ${field} must be a number, got ${typeof value}`,
      );
    }

    const epochMs = this.assertValidEpochMs(value, `task "${taskId}" ${field}`);
    return new Date(epochMs);
  }
}
