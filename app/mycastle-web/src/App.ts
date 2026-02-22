import { MqttClient, mqttClient } from './modules/mqttclient';
import { FilesystemService, filesystemService } from './modules/filesystem';
import { AiService, aiService } from './modules/ai';
import { SpeechService, speechService, WakeWordService, wakeWordService } from './modules/speech';
import {
  ConversationService, conversationService,
  ConversationHistoryService, conversationHistoryService,
  ActionRegistry, actionRegistry,
} from './modules/conversation';
import { AutomateService, automateService } from './modules/automate/services/AutomateService';
import { UIFormService, uiFormService } from './modules/uiforms/services/UIFormService';
import { ReceiptScannerService, receiptScannerService } from './modules/shopping/services/ReceiptScannerService';
import { PageHooksService, pageHooksService } from './modules/automate/hooks/PageHooksService';

export class App {
  private static _instance: App;

  readonly mqttClient: MqttClient;
  readonly filesystemService: FilesystemService;
  readonly aiService: AiService;
  readonly speechService: SpeechService;
  readonly wakeWordService: WakeWordService;
  readonly conversationService: ConversationService;
  readonly conversationHistoryService: ConversationHistoryService;
  readonly actionRegistry: ActionRegistry;
  readonly automateService: AutomateService;
  readonly uiFormService: UIFormService;
  readonly receiptScannerService: ReceiptScannerService;
  readonly pageHooksService: PageHooksService;

  private constructor() {
    this.mqttClient = mqttClient;
    this.filesystemService = filesystemService;
    this.aiService = aiService;
    this.speechService = speechService;
    this.wakeWordService = wakeWordService;
    this.conversationService = conversationService;
    this.conversationHistoryService = conversationHistoryService;
    this.actionRegistry = actionRegistry;
    this.automateService = automateService;
    this.uiFormService = uiFormService;
    this.receiptScannerService = receiptScannerService;
    this.pageHooksService = pageHooksService;
  }

  static create(): App {
    if (App._instance) return App._instance;
    App._instance = new App();
    return App._instance;
  }

  static get instance(): App {
    if (!App._instance) {
      throw new Error('App not created yet — call App.create() first');
    }
    return App._instance;
  }

  async init(): Promise<void> {
    console.log('App initialized');
  }

  async shutdown(): Promise<void> {
    this.wakeWordService.stop();
    this.mqttClient.disconnect();
    console.log('App shut down');
  }
}
