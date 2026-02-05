/**
 * Inicjalizacja wbudowanych akcji konwersacyjnych
 */

import { NavigateFunction } from 'react-router-dom';
import { DataSource } from '../../filesystem/data/DataSource';
import { actionRegistry } from './ActionRegistry';
import { registerTaskActions } from './taskActions';
import { registerCalendarActions } from './calendarActions';
import { registerFileActions } from './fileActions';
import { registerPersonActions } from './personActions';
import { registerProjectActions } from './projectActions';
import { registerNavigationActions } from './navigationActions';
import { registerAutomateActions } from './automateActions';
import { registerShoppingActions } from './shoppingActions';

export function initializeActions(
  dataSource: DataSource,
  navigate: NavigateFunction
): void {
  actionRegistry.clear();
  registerTaskActions(dataSource);
  registerCalendarActions(dataSource);
  registerFileActions();
  registerPersonActions(dataSource);
  registerProjectActions(dataSource);
  registerNavigationActions(navigate);
  registerAutomateActions(dataSource);
  registerShoppingActions(dataSource);
}
