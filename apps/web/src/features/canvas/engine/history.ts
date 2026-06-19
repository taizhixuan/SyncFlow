import type { Command, Doc } from '../model/commands';

interface Entry {
  undo: Command;
  redo: Command;
}

export class History {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private limit = 200;

  push(doc: Doc, cmd: Command): Doc {
    const undo = cmd.invert(doc);
    this.past.push({ undo, redo: cmd });
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    return cmd.apply(doc);
  }

  undo(doc: Doc): Doc {
    const entry = this.past.pop();
    if (!entry) return doc;
    this.future.push(entry);
    return entry.undo.apply(doc);
  }

  redo(doc: Doc): Doc {
    const entry = this.future.pop();
    if (!entry) return doc;
    this.past.push(entry);
    return entry.redo.apply(doc);
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }
}
