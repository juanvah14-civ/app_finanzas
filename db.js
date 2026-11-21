/* Almacenamiento local con IndexedDB.
 * Cada registro tiene id (uuid), actualizado (ms) y borrado (bool),
 * para poder sincronizar entre dispositivos más adelante. */
const DB = (() => {
  const NAME = 'finanzas';
  const VERSION = 1;
  const STORES = ['movimientos', 'categorias', 'ajustes'];
  let dbp;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      Promise.resolve(fn(s)).then(r => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  return {
    uuid,
    async all(store, { incluirBorrados = false } = {}) {
      const rows = await tx(store, 'readonly', s => reqP(s.getAll()));
      return incluirBorrados ? rows : rows.filter(r => !r.borrado);
    },
    async get(store, id) {
      return tx(store, 'readonly', s => reqP(s.get(id)));
    },
    async put(store, obj) {
      const row = { ...obj, id: obj.id || uuid(), actualizado: Date.now(), borrado: !!obj.borrado };
      await tx(store, 'readwrite', s => reqP(s.put(row)));
      return row;
    },
    async putRaw(store, rows) {
      await tx(store, 'readwrite', s => Promise.all(rows.map(r => reqP(s.put(r)))));
    },
    async remove(store, id) {
      const row = await this.get(store, id);
      if (row) await this.put(store, { ...row, borrado: true });
    },
    async clear(store) {
      await tx(store, 'readwrite', s => reqP(s.clear()));
    },
    STORES,
  };
})();
