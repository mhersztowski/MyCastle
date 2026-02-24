import { type BoardProfile, boardProfiles } from './BoardProfile';

/**
 * Manages the currently selected board profile.
 * Blocks that depend on pin lists should re-read the selected profile
 * after a changeBoard() call.
 */
export class BoardManager {
  private selectedKey: string;

  constructor(initialBoardKey = 'uno') {
    if (!boardProfiles[initialBoardKey]) {
      console.warn(
        `Board "${initialBoardKey}" not found, falling back to "uno".`,
      );
      this.selectedKey = 'uno';
    } else {
      this.selectedKey = initialBoardKey;
    }
  }

  /** The currently selected board profile. */
  get selected(): BoardProfile {
    return boardProfiles[this.selectedKey];
  }

  /** The key of the currently selected board (e.g. "uno", "nano_328"). */
  get selectedBoardKey(): string {
    return this.selectedKey;
  }

  /**
   * Switch to a different board profile.
   * @returns true if the board was changed, false if the key is invalid.
   */
  changeBoard(boardKey: string): boolean {
    if (!boardProfiles[boardKey]) {
      console.warn(`Tried to set non-existing Arduino board: ${boardKey}`);
      return false;
    }
    this.selectedKey = boardKey;
    return true;
  }

  /** List all registered board keys. */
  getAvailableBoardKeys(): string[] {
    return Object.keys(boardProfiles);
  }
}
