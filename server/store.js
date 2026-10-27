import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// A list of records in one JSON file, newest first; writes go through a temp file so a crash never leaves it
// half-written. `keyOf` names the field that makes two records the same: adding one again replaces the old.
export class JsonStore {
  #file;
  #keyOf;
  #items = [];
  #writing = Promise.resolve();

  constructor(file, keyOf) {
    this.#file = file;
    this.#keyOf = keyOf;
  }

  async load() {
    try {
      this.#items = JSON.parse(await readFile(this.#file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  list() {
    return this.#items;
  }

  async add(fields) {
    const item = { id: randomUUID(), ...fields, addedAt: new Date().toISOString() };
    const key = this.#keyOf(item);
    this.#items = [item, ...this.#items.filter((e) => this.#keyOf(e) !== key)];
    await this.#save();
    return item;
  }

  async restore(item) {
    this.#items = [item, ...this.#items.filter((e) => e.id !== item.id)]
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    await this.#save();
    return item;
  }

  async remove(id) {
    this.#items = this.#items.filter((e) => e.id !== id);
    await this.#save();
  }

  /** Empties the store, first copying the current file to `backupFile` so a reset can be undone by hand. */
  async clear(backupFile) {
    const json = JSON.stringify(this.#items, null, 2);
    this.#items = [];
    this.#writing = this.#writing.then(() => writeFile(backupFile, json, 'utf8'));
    await this.#save();
  }

  #save() {
    const json = JSON.stringify(this.#items, null, 2);
    this.#writing = this.#writing.then(async () => {
      await mkdir(path.dirname(this.#file), { recursive: true });
      const tmp = `${this.#file}.tmp`;
      await writeFile(tmp, json, 'utf8');
      await rename(tmp, this.#file);
    });
    return this.#writing;
  }
}
