import { boardProfiles, type UPythonBoardProfile } from './BoardProfile';

export class UPythonBoardManager {
  private _selectedKey: string;

  constructor(initialKey = 'esp32_generic') {
    this._selectedKey = boardProfiles[initialKey] ? initialKey : 'esp32_generic';
  }

  get selected(): UPythonBoardProfile {
    return boardProfiles[this._selectedKey];
  }

  get selectedBoardKey(): string {
    return this._selectedKey;
  }

  changeBoard(key: string): boolean {
    if (boardProfiles[key]) {
      this._selectedKey = key;
      return true;
    }
    return false;
  }

  getAvailableBoardKeys(): string[] {
    return Object.keys(boardProfiles);
  }
}
