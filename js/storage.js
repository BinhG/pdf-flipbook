// --- IndexedDB Helper for Recent Books ---
const BookStore = {
    dbName: 'PDFViewerDB',
    storeName: 'books',
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'name' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async saveBook(name, data, isUrl) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const book = {
                name: name,
                data: data, // Blob or URL string
                isUrl: isUrl,
                timestamp: Date.now()
            };
            store.put(book); // Update or Insert

            // Cleanup old books (Keep last 10)
            transaction.oncomplete = () => this.cleanup();
            resolve();
        });
    },

    async getRecentBooks() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            const request = index.openCursor(null, 'prev'); // Descending order
            const books = [];

            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && books.length < 10) {
                    books.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(books);
                }
            };
        });
    },

    async cleanup() {
        // Keep only top 10 recent
        const books = await this.getRecentBooks();
        if (books.length < 10) return;

        const keepNames = new Set(books.map(b => b.name));
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        store.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                if (!keepNames.has(cursor.value.name)) {
                    cursor.delete();
                }
                cursor.continue();
            }
        };
    },

    async clearAllBooks() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            store.clear();
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e.target.error);
        });
    }
};

window.BookStore = BookStore;
