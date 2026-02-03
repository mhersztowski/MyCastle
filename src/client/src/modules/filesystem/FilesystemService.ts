import { DirData } from './data/DirData';
import { FileData } from './data/FileData';
import { Calendar, CalendarItem } from './data/Calendar';
import { DataSource } from './data/DataSource';
import { mqttClient } from '../mqttclient';
import { DirectoryTree } from '../mqttclient/types';
import { DirModel } from './models/DirModel';
import { FileModel, FileComponentModel } from './models/FileModel';
import { PersonsModel } from './models/PersonModel';
import { TasksModel } from './models/TaskModel';
import { ProjectsModel } from './models/ProjectModel';

// Interface for dirinfo.json structure (from backend)
interface DirinfoFileComponent {
  type: string;
  schemaPath?: string;
  ref?: string;
  objectType?: string;
  visible?: boolean;
  id?: string;
}

interface DirinfoFile {
  type: string;
  name: string;
  kind?: string;
  id?: string;
  description?: string;
  components?: DirinfoFileComponent[];
}

interface DirinfoData {
  type: 'dir';
  id?: string;
  name?: string;
  description?: string;
  files?: DirinfoFile[];
}

export class FilesystemService {
  private rootDir: DirData | null = null;
  private calendar: Calendar = new Calendar();
  private dataSource: DataSource = new DataSource();

  async loadDirectory(path: string = ''): Promise<DirData> {
    const tree = await mqttClient.listDirectory(path);
    this.rootDir = this.buildDirData(tree);
    return this.rootDir;
  }

  async readFile(path: string): Promise<FileData | null> {
    if (!this.rootDir) return null;

    const fileData = this.rootDir.getFileByPath(path);
    if (!fileData) return null;

    const mqttFile = await mqttClient.readFile(path);
    const encoder = new TextEncoder();
    fileData.setData(encoder.encode(mqttFile.content));

    return fileData;
  }

  async writeFile(path: string, content: string): Promise<FileData | null> {
    await mqttClient.writeFile(path, content);

    if (!this.rootDir) return null;

    const fileData = this.rootDir.getFileByPath(path);
    if (fileData) {
      const encoder = new TextEncoder();
      fileData.setData(encoder.encode(content));
      return fileData;
    }

    return null;
  }

  async deleteFile(path: string): Promise<boolean> {
    const result = await mqttClient.deleteFile(path);
    return result.success;
  }

  getRootDir(): DirData | null {
    return this.rootDir;
  }

  getCalendar(): Calendar {
    return this.calendar;
  }

  getDataSource(): DataSource {
    return this.dataSource;
  }

  /**
   * Load all data from the filesystem:
   * 1. Load directory tree
   * 2. Load content of all JSON and MD files
   * 3. Process all dirinfo.json files to create components
   */
  async loadAllData(): Promise<DirData> {
    console.log('FilesystemService: Starting loadAllData()...');

    // 1. Load directory tree
    const tree = await mqttClient.listDirectory();
    this.rootDir = this.buildDirData(tree);
    console.log('FilesystemService: Directory tree loaded');

    // 2. Collect all JSON and MD files
    const filesToLoad = this.collectFilesByExtension(this.rootDir, ['.json', '.md']);
    console.log(`FilesystemService: Found ${filesToLoad.length} files to load`);

    // 3. Load content of all files
    await this.loadFilesContent(filesToLoad);
    console.log('FilesystemService: All file contents loaded');

    // 4. Process all dirinfo.json files
    await this.processAllDirinfo(this.rootDir);
    console.log('FilesystemService: All dirinfo.json processed');

    // 5. Load calendar data
    this.loadCalendarData(this.rootDir);
    console.log(`FilesystemService: Calendar loaded with ${this.calendar.size()} days`);

    // 6. Load DataSource with Node objects
    this.loadDataSource(this.rootDir);
    const stats = this.dataSource.getStats();
    console.log(`FilesystemService: DataSource loaded - ${stats.persons} persons, ${stats.tasks} tasks, ${stats.projects} projects, ${stats.events} events`);

    return this.rootDir;
  }

  /**
   * Recursively collect all files with given extensions
   */
  private collectFilesByExtension(dir: DirData, extensions: string[]): FileData[] {
    const files: FileData[] = [];

    for (const file of dir.getFiles()) {
      const ext = '.' + file.getExt().toLowerCase();
      if (extensions.includes(ext)) {
        files.push(file);
      }
    }

    for (const subDir of dir.getDirs()) {
      files.push(...this.collectFilesByExtension(subDir, extensions));
    }

    return files;
  }

  /**
   * Load content for all given files via MQTT
   */
  private async loadFilesContent(files: FileData[]): Promise<void> {
    const encoder = new TextEncoder();

    // Load files in parallel batches to avoid overwhelming the server
    const batchSize = 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (fileData) => {
          try {
            const mqttFile = await mqttClient.readFile(fileData.getPath());
            fileData.setData(encoder.encode(mqttFile.content));
          } catch (err) {
            console.warn(`Failed to load file ${fileData.getPath()}:`, err);
          }
        })
      );
    }
  }

  /**
   * Load calendar data from data/calendar directory
   */
  private loadCalendarData(rootDir: DirData): void {
    this.calendar.clear();

    const calendarDir = rootDir.getSubDir(['data', 'calendar']);
    if (!calendarDir) {
      console.log('FilesystemService: Calendar directory not found');
      return;
    }

    this.loadCalendarItemsRecursively(calendarDir);
  }

  /**
   * Recursively load calendar items from calendar directory structure
   */
  private loadCalendarItemsRecursively(dir: DirData): void {
    for (const file of dir.getFiles()) {
      if (file.getName().endsWith('.json') && file.getName() !== 'dirinfo.json') {
        const calendarItem = CalendarItem.fromFileData(file);
        if (calendarItem) {
          this.calendar.addItem(calendarItem);
        }
      }
    }

    for (const subDir of dir.getDirs()) {
      this.loadCalendarItemsRecursively(subDir);
    }
  }

  /**
   * Load DataSource from JSON files
   */
  private loadDataSource(rootDir: DirData): void {
    this.dataSource.clear();

    // Load persons from data/persons.json
    const personsFile = rootDir.getFileByPath('data/persons.json');
    if (personsFile && personsFile.getData().length > 0) {
      try {
        const data = JSON.parse(personsFile.toString()) as PersonsModel;
        if (data.type === 'persons') {
          this.dataSource.loadPersons(data);
        }
      } catch (err) {
        console.warn('Failed to parse persons.json:', err);
      }
    }

    // Load projects from data/projects.json (before tasks for proper linking)
    const projectsFile = rootDir.getFileByPath('data/projects.json');
    if (projectsFile && projectsFile.getData().length > 0) {
      try {
        const data = JSON.parse(projectsFile.toString()) as ProjectsModel;
        if (data.type === 'projects') {
          this.dataSource.loadProjects(data);
        }
      } catch (err) {
        console.warn('Failed to parse projects.json:', err);
      }
    }

    // Load tasks from data/tasks.json
    const tasksFile = rootDir.getFileByPath('data/tasks.json');
    if (tasksFile && tasksFile.getData().length > 0) {
      try {
        const data = JSON.parse(tasksFile.toString()) as TasksModel;
        if (data.type === 'tasks') {
          this.dataSource.loadTasks(data);
        }
      } catch (err) {
        console.warn('Failed to parse tasks.json:', err);
      }
    }

    // Load events from calendar
    this.dataSource.loadEventsFromCalendar(this.calendar.getItems());

    this.dataSource.setLoaded(true);
  }

  /**
   * Recursively find and process all dirinfo.json files
   */
  private async processAllDirinfo(dir: DirData): Promise<void> {
    // Check if this directory has a dirinfo.json
    const dirinfoFile = dir.getFileByName('dirinfo.json');
    if (dirinfoFile && dirinfoFile.getData().length > 0) {
      try {
        const content = dirinfoFile.toString();
        const dirinfoData: DirinfoData = JSON.parse(content);
        const dirModel = this.convertDirinfoToDirModel(dirinfoData, dir.getPath());

        // Clear existing components before setting new model
        for (const fileData of dir.getFiles()) {
          fileData.getComponents().length = 0;
        }

        dir.setModel(dirModel);
        console.log(`Processed dirinfo for ${dir.getPath()}: ${dirModel.files.length} files`);
      } catch (err) {
        console.warn(`Failed to process dirinfo.json in ${dir.getPath()}:`, err);
      }
    }

    // Process subdirectories
    for (const subDir of dir.getDirs()) {
      await this.processAllDirinfo(subDir);
    }
  }

  private buildDirData(tree: DirectoryTree, parent?: DirData): DirData {
    // Normalize paths to use forward slashes (Windows paths use backslashes)
    const normalizedPath = tree.path.replace(/\\/g, '/');
    const dirData = new DirData(tree.name, normalizedPath);

    if (tree.children) {
      for (const child of tree.children) {
        const childPath = child.path.replace(/\\/g, '/');
        if (child.type === 'directory') {
          const subDir = this.buildDirData({ ...child, path: childPath }, dirData);
          dirData.getDirs().push(subDir);
        } else {
          const fileData = new FileData(child.name, childPath, dirData);
          dirData.getFiles().push(fileData);
        }
      }
    }

    return dirData;
  }

  getDirByPath(dirPath: string): DirData | undefined {
    if (!this.rootDir) return undefined;
    if (dirPath === '' || dirPath === '/') return this.rootDir;

    const pathParts = dirPath.split('/').filter(part => part.length > 0);
    return this.rootDir.getSubDir(pathParts);
  }

  syncDirinfo(dirinfoPath: string, content: string): boolean {
    if (!this.rootDir) return false;

    // Get the directory path from the dirinfo.json path
    const dirPath = dirinfoPath.endsWith('/dirinfo.json')
      ? dirinfoPath.slice(0, -'/dirinfo.json'.length)
      : dirinfoPath.replace(/\/dirinfo\.json$/, '').replace(/dirinfo\.json$/, '');

    const dirData = this.getDirByPath(dirPath);
    if (!dirData) {
      console.warn(`Directory not found for dirinfo sync: ${dirPath}`);
      return false;
    }

    try {
      const dirinfoData: DirinfoData = JSON.parse(content);
      const dirModel = this.convertDirinfoToDirModel(dirinfoData, dirPath);

      // Clear existing components before setting new model
      for (const fileData of dirData.getFiles()) {
        fileData.getComponents().length = 0;
      }

      dirData.setModel(dirModel);
      console.log(`Synced dirinfo for ${dirPath}: ${dirModel.files.length} files updated`);
      return true;
    } catch (err) {
      console.error('Failed to parse dirinfo content:', err);
      return false;
    }
  }

  private convertDirinfoToDirModel(dirinfo: DirinfoData, dirPath: string): DirModel {
    const files: FileModel[] = (dirinfo.files || []).map(file => {
      const components: FileComponentModel[] = (file.components || []).map(comp => {
        // Map dirinfo component format to FileComponentModel format
        return {
          type: comp.type,
          schemaPath: comp.schemaPath || comp.ref || '',
          objectType: comp.objectType || '',
          visible: comp.visible !== undefined ? comp.visible : true,
        } as FileComponentModel;
      });

      return {
        type: 'file' as const,
        id: file.id || '',
        name: file.name,
        description: file.description || '',
        components,
      };
    });

    return {
      type: 'dir' as const,
      id: dirinfo.id || '',
      name: dirinfo.name || dirPath.split('/').pop() || '',
      description: dirinfo.description || '',
      components: [],
      files,
    };
  }
}

export const filesystemService = new FilesystemService();
