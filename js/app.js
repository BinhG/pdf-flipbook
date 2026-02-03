const App = {
    pdfDoc: null,
    pageFlip: null,
    currentFileUrl: null,
    currentFileName: 'document.pdf',
    pdfData: null,

    currentZoom: 1.0,

    initWorker() {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    },

    elements: {
        loading: document.getElementById('loading'),
        book: document.getElementById('book'), // The container for PageFlip
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn'),
        zoomInBtn: document.getElementById('zoom-in-btn'),
        zoomOutBtn: document.getElementById('zoom-out-btn'),
        // pageIndicator: document.getElementById('page-indicator'), // Might need to update how this works
        // currentPages: document.getElementById('current-pages'),
        // totalPages: document.getElementById('total-pages'),
        uploadDialog: document.getElementById('upload-dialog'),
        shareDialog: document.getElementById('share-dialog'),
        uploadBtn: document.getElementById('upload-btn'),
        shareBtn: document.getElementById('share-btn'),
        toast: document.getElementById('toast'),
        // Sidebar elements
        sidebar: document.getElementById('sidebar'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
        closeSidebarBtn: document.getElementById('close-sidebar-btn'),
        clearHistoryBtn: document.getElementById('clear-history-btn'),
        recentBooksList: document.getElementById('recent-books-list'),
        recentBtn: document.getElementById('recent-btn'),
    },

    async init() {
        this.initWorker();
        this.addEventListeners();
        this.handleURLParams();

        try {
            await BookStore.init();
            this.updateRecentBooksList();
            this.fetchServerFiles();
        } catch (e) {
            console.error('IndexedDB init failed', e);
        }
    },

    async fetchServerFiles() {
        try {
            let response;
            let baseUrl = '';

            try {
                // First try relative path
                response = await fetch('/files');
                if (!response.ok) throw new Error('Relative fetch failed');
            } catch (e) {
                // Use fallback to default localhost port if relative fails (e.g. running from file://)
                console.warn('Relative fetch failed, trying localhost:3000 fallback...');
                baseUrl = 'http://localhost:3000';
                response = await fetch(`${baseUrl}/files`);
            }

            if (!response.ok) throw new Error('Failed to fetch server files');
            const files = await response.json();

            const list = document.getElementById('server-books-list');
            list.innerHTML = '';

            if (files.length === 0) {
                list.innerHTML = '<p style="color: var(--text-color-light); font-size: 0.9rem; padding: 1rem;">No files on server.</p>';
                return;
            }

            files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'book-item';
                item.innerHTML = `
                    <div class="book-icon">☁️</div>
                    <div class="book-info">
                        <div class="book-title">${file.name}</div>
                    </div>
                `;
                item.onclick = async () => {
                    this.currentFileName = file.name;
                    // Ensure we use the correct base URL for the file content too
                    // If the file.url is relative (starts with /), prepend the baseUrl
                    const fullUrl = (baseUrl && file.url.startsWith('/')) ? baseUrl + file.url : file.url;

                    await this.loadPDF(fullUrl, true, true); // Save to recent
                    this.toggleSidebar(false);
                };
                list.appendChild(item);
            });

        } catch (error) {
            console.error('Error fetching server files:', error);
            const isFileProtocol = window.location.protocol === 'file:';
            const errorMsg = isFileProtocol
                ? 'Server not found. Run <br><code>npm start</code><br> and check port 3000.'
                : 'Error loading library. Server offline?';

            document.getElementById('server-books-list').innerHTML = `<p style="color: var(--error-color, red); padding: 1rem; font-size: 0.9rem;">${errorMsg}</p>`;
        }
    },

    addEventListeners() {
        this.elements.uploadBtn.addEventListener('click', () => this.elements.uploadDialog.showModal());
        document.getElementById('close-upload-btn').addEventListener('click', () => this.elements.uploadDialog.close());

        this.elements.shareBtn.addEventListener('click', () => this.showShareModal());
        document.getElementById('close-share-btn').addEventListener('click', () => this.elements.shareDialog.close());

        document.getElementById('file-input').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('load-url-btn').addEventListener('click', () => this.handleURLLoad());

        const uploadArea = document.getElementById('upload-area');
        uploadArea.addEventListener('click', () => document.getElementById('file-input').click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => this.handleFileDrop(e));

        document.getElementById('url-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleURLLoad();
        });

        // Navigation for PageFlip
        this.elements.prevBtn.addEventListener('click', () => {
            if (this.pageFlip) this.pageFlip.flipPrev();
        });
        this.elements.nextBtn.addEventListener('click', () => {
            if (this.pageFlip) this.pageFlip.flipNext();
        });

        // Zoom Controls
        this.elements.zoomInBtn.addEventListener('click', () => this.zoom(0.1));
        this.elements.zoomOutBtn.addEventListener('click', () => this.zoom(-0.1));

        document.getElementById('copy-link-btn').addEventListener('click', () => this.copyToClipboard('share-link', 'Link copied!'));
        document.getElementById('copy-embed-btn').addEventListener('click', () => this.copyToClipboard('embed-code', 'Embed code copied!'));

        // Sidebar events
        this.elements.recentBtn.addEventListener('click', () => this.toggleSidebar(true));
        this.elements.closeSidebarBtn.addEventListener('click', () => this.toggleSidebar(false));
        this.elements.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        this.elements.sidebarOverlay.addEventListener('click', () => this.toggleSidebar(false));

        document.addEventListener('keydown', (e) => {
            if (this.pageFlip) {
                if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                    e.preventDefault();
                    this.pageFlip.flipPrev();
                }
                if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                    e.preventDefault();
                    this.pageFlip.flipNext();
                }
            }
        });
    },

    async clearHistory() {
        if (confirm('Are you sure you want to clear your reading history?')) {
            await BookStore.clearAllBooks();
            this.updateRecentBooksList();
            this.showToast('History cleared', 'info');
        }
    },

    toggleSidebar(show) {
        if (show) {
            this.elements.sidebar.classList.add('open');
            this.elements.sidebarOverlay.classList.add('open');
            this.updateRecentBooksList();
        } else {
            this.elements.sidebar.classList.remove('open');
            this.elements.sidebarOverlay.classList.remove('open');
        }
    },

    zoom(delta) {
        this.currentZoom += delta;
        // Clamp zoom
        if (this.currentZoom < 0.5) this.currentZoom = 0.5;
        if (this.currentZoom > 2.0) this.currentZoom = 2.0;

        // Apply scale transform to the PageFlip container (internal div used by page-flip)
        // OR apply it to our #book wrapper if page-flip doesn't overwrite it.
        // PageFlip creates a wrapper. Let's try applying to #book since it's the parent we control.
        this.elements.book.style.transform = `scale(${this.currentZoom})`;
    },

    async updateRecentBooksList() {
        const books = await BookStore.getRecentBooks();
        const list = this.elements.recentBooksList;
        list.innerHTML = '';

        if (books.length === 0) {
            list.innerHTML = '<p style="color: var(--text-color-light); font-size: 0.9rem;">No recent books.</p>';
            return;
        }

        books.forEach(book => {
            const item = document.createElement('div');
            item.className = 'book-item';
            item.innerHTML = `
                <div class="book-icon">📕</div>
                <div class="book-info">
                    <div class="book-title">${book.name}</div>
                    <div class="book-date">${new Date(book.timestamp).toLocaleDateString()}</div>
                </div>
            `;
            item.onclick = () => {
                this.loadRecentBook(book);
                this.toggleSidebar(false);
            };
            list.appendChild(item);
        });
    },

    async loadRecentBook(book) {
        this.currentFileName = book.name;
        if (book.isUrl) {
            await this.loadPDF(book.data, true, false); // false = don't save again
        } else {
            if (book.data instanceof Blob) {
                // OPTIMIZATION: Use Blob URL instead of FileReader (base64)
                // This prevents memory crashes with large files
                const blobUrl = URL.createObjectURL(book.data);
                await this.loadPDF(blobUrl, true, false);
            } else {
                // Fallback for any old strings
                this.loadPDF(book.data, false, false);
            }
        }
    },

    showToast(message, type = 'success') {
        this.elements.toast.textContent = message;
        this.elements.toast.className = `toast show ${type}`;
        setTimeout(() => this.elements.toast.classList.remove('show'), 3000);
    },

    async loadPDF(input, isUrl = false, shouldSave = true) {
        try {
            this.elements.loading.innerHTML = '<div class="spinner"></div><p>Loading PDF...</p>';
            this.elements.loading.classList.remove('hidden');

            // Clean up previous instance
            if (this.pageFlip) {
                this.pageFlip.destroy();
                this.pageFlip = null;
            }

            // ROBUST CLEANUP:
            // "Cannot read properties of undefined (reading 'setDensity')" is often a zombie instance 
            // trying to render on a destroyed element.
            // We replace the entire DOM node to ensure a fresh start.

            // Safety: Ensure we have the current element specifically from DOM
            let oldBook = document.getElementById('book');

            // Fallback if missing (shouldn't happen, but safe)
            if (!oldBook) {
                const container = document.querySelector('.flipbook-container');
                oldBook = document.createElement('div');
                oldBook.id = 'book';
                container.appendChild(oldBook);
            }

            const newBook = oldBook.cloneNode(false); // shallow clone

            if (oldBook.parentNode) {
                oldBook.parentNode.replaceChild(newBook, oldBook);
            } else {
                // If oldBook exists but is detached, just append new one to container
                document.querySelector('.flipbook-container').appendChild(newBook);
            }

            this.elements.book = newBook;

            // Clean up previous Blob URL to prevent memory leaks
            if (this.currentFileUrl && this.currentFileUrl.startsWith('blob:')) {
                URL.revokeObjectURL(this.currentFileUrl);
            }

            if (isUrl) {
                this.currentFileUrl = input;
                this.pdfData = null;
                const loadingTask = pdfjsLib.getDocument(input);
                this.pdfDoc = await loadingTask.promise;

                if (shouldSave) {
                    BookStore.saveBook(this.currentFileName, input, true);
                }
            } else {
                // Input is a Data URL string
                this.currentFileUrl = null;
                this.pdfDoc = await pdfjsLib.getDocument(input).promise;

                // Extract Base64 for sharing
                const base64Content = input.split(',')[1];
                if (base64Content && base64Content.length < 50000) {
                    this.pdfData = base64Content;
                } else {
                    this.pdfData = null;
                }

                if (shouldSave) {
                    BookStore.saveBook(this.currentFileName, input, false);
                }
            }

            // Initialize PageFlip
            await this.initPageFlip();

            this.elements.loading.classList.add('hidden');
            this.elements.shareBtn.disabled = false;
            this.elements.uploadDialog.close();
            this.elements.prevBtn.disabled = false;
            this.elements.nextBtn.disabled = false;


            if (shouldSave) {
                this.showToast('Book saved to library', 'success');
            } else {
                this.showToast('PDF loaded successfully!', 'success');
            }
        } catch (error) {
            console.error('Error loading PDF:', error);
            // Show detailed error in UI
            this.elements.loading.innerHTML = `<p style="color:red">❌ Error: ${error.message || error}</p>`;
            this.showToast('Could not load PDF: ' + (error.message || 'Unknown error'), 'error');
        }
    },

    async initPageFlip() {
        const numPages = this.pdfDoc.numPages;
        this.elements.book.innerHTML = ''; // Clear previous pages

        // Create page elements
        for (let i = 1; i <= numPages; i++) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            // Added page-footer for numbering
            pageDiv.innerHTML = `
                <div class="page-content">
                    <canvas id="canvas-page-${i}"></canvas>
                </div>
                <div class="page-footer">${i}</div>
             `;
            this.elements.book.appendChild(pageDiv);
        }

        // Initialize the library
        this.pageFlip = new St.PageFlip(this.elements.book, {
            width: 550, // base page width
            height: 733, // base page height
            size: "stretch",
            // set threshold values:
            minWidth: 315,
            maxWidth: 1000,
            minHeight: 420,
            maxHeight: 1350,
            maxShadowOpacity: 0, // [MODIFIED] Removed shadow on hover/flip
            showCover: true,
            mobileScrollSupport: false // disable mobile scroll support
        });

        this.pageFlip.loadFromHTML(document.querySelectorAll('.page'));

        // Trigger rendering of visible pages
        this.renderAllPages();
    },

    // Optimization: In a real large PDF scenario, we should only render visible pages.
    // However, for simplicity and to match previous functionality (which loaded mostly small files),
    // we will start by rendering all pages.
    async renderAllPages() {
        for (let i = 1; i <= this.pdfDoc.numPages; i++) {
            await this.renderPage(i);
        }
    },

    async renderPage(pageNum) {
        const canvas = document.getElementById(`canvas-page-${pageNum}`);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const page = await this.pdfDoc.getPage(pageNum);

        // We render at a high enough scale for quality, PageFlip handles the sizing
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = { canvasContext: ctx, viewport: viewport };
        await page.render(renderContext).promise;
    },

    async uploadAndLoad(file) {
        if (!file || file.type !== 'application/pdf') {
            this.showToast('Please select a valid PDF file.', 'error');
            return;
        }

        this.elements.loading.innerHTML = '<div class="spinner"></div><p>Uploading PDF...</p>';
        this.elements.loading.classList.remove('hidden');
        this.elements.uploadDialog.close(); // Close dialog immediately to show spinner

        try {
            const formData = new FormData();
            formData.append('pdfFile', file);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const result = await response.json();

            if (result.success) {
                this.currentFileName = result.filename;
                // Load from the returned URL
                // isUrl = true, shouldSave = true (save to history as URL)
                await this.loadPDF(result.url, true, true);
            } else {
                throw new Error(result.error || 'Upload failed');
            }

        } catch (error) {
            console.error('Upload error:', error);
            this.elements.loading.innerHTML = '<p>❌ Upload failed</p>';
            this.showToast('Could not upload PDF. Please try again.', 'error');
        }
    },

    handleFileUpload(e) {
        const file = e.target.files[0];
        this.uploadAndLoad(file);
    },

    handleFileDrop(e) {
        e.preventDefault();
        document.getElementById('upload-area').classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        this.uploadAndLoad(file);
    },

    async handleURLLoad() {
        const url = document.getElementById('url-input').value.trim();
        if (!url) {
            this.showToast('Please enter a URL.', 'info');
            return;
        }

        this.elements.loading.innerHTML = '<div class="spinner"></div><p>Downloading PDF...</p>';
        this.elements.loading.classList.remove('hidden');
        this.elements.uploadDialog.close(); // Close dialog immediately to show spinner

        try {
            // Strategy:
            // 1. Fetch Blob using CORS Proxy (corsproxy.io is very reliable for files)
            // 2. Save the Blob to IndexedDB (Library) immediately
            // 3. Display using a temporary Blob URL (efficient, no Base64 conversion needed)

            const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);

            let blob;
            try {
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`Proxy HTTP ${response.status}`);
                blob = await response.blob();
            } catch (fetchError) {
                console.warn('Proxy fetch failed, trying direct...', fetchError);
                const directResponse = await fetch(url);
                if (!directResponse.ok) throw new Error(`Direct HTTP ${directResponse.status}`);
                blob = await directResponse.blob();
            }

            // Success! We have the blob.
            this.currentFileName = url.split('/').pop() || 'document.pdf';

            // 1. Save to Library
            await BookStore.saveBook(this.currentFileName, blob, false); // isUrl=false because we have the file data

            // 2. Create Blob URL for viewing
            const blobUrl = URL.createObjectURL(blob);

            // 3. Load it (don't save again)
            await this.loadPDF(blobUrl, true, false);

            this.showToast('PDF downloaded & saved to library!', 'success');

        } catch (e) {
            console.error('All load attempts failed:', e);

            // Final Fallback: Link directly (PDF.js might still fail if CORS blocks it, but worth a shot)
            this.elements.loading.innerHTML = '<p>Download failed. Opening link...</p>';
            this.currentFileName = url.split('/').pop() || 'document.pdf';
            await this.loadPDF(url, true, true);
        }
    },

    showShareModal() {
        let shareUrl = '';
        let isLocalOnly = false;

        if (this.currentFileUrl) {
            // Hosted file
            try {
                const urlObj = new URL(this.currentFileUrl, window.location.origin);

                // If same origin, use relative path to keep link clean (e.g. ?file=/book.pdf)
                let fileParam = this.currentFileUrl;
                if (urlObj.origin === window.location.origin) {
                    fileParam = urlObj.pathname + urlObj.search + urlObj.hash;
                }

                shareUrl = `${window.location.origin}${window.location.pathname}?file=${encodeURIComponent(fileParam)}`;
            } catch (e) {
                shareUrl = `${window.location.origin}${window.location.pathname}?file=${encodeURIComponent(this.currentFileUrl)}`;
            }

        } else if (this.pdfData) {
            // Small local file
            shareUrl = `${window.location.origin}${window.location.pathname}?pdf=${this.pdfData}`;
        } else {
            // Large local file - Template Mode
            isLocalOnly = true;
            // Mock URL for template
            shareUrl = `${window.location.origin}${window.location.pathname}?file=${encodeURIComponent(this.currentFileName)}`;
        }

        const embedCode = `<iframe src="${shareUrl}" width="100%" height="600px" style="border:none;"></iframe>`;

        const hostedDiv = document.getElementById('share-content-hosted');
        const localDiv = document.getElementById('share-warning-local');

        if (isLocalOnly) {
            hostedDiv.classList.add('hidden');
            localDiv.classList.remove('hidden');

            document.getElementById('template-share-link').textContent = shareUrl;
            document.getElementById('template-embed-code').textContent = embedCode;

            // Point copy buttons to templates
            document.getElementById('copy-link-btn').onclick = () => this.copyToClipboard('template-share-link', 'Template link copied!');
            document.getElementById('copy-embed-btn').onclick = () => this.copyToClipboard('template-embed-code', 'Template embed code copied!');

        } else {
            hostedDiv.classList.remove('hidden');
            localDiv.classList.add('hidden');

            document.getElementById('share-link').textContent = shareUrl;
            document.getElementById('embed-code').textContent = embedCode;
            this.generateQRCode(shareUrl);

            // Point copy buttons to real links
            document.getElementById('copy-link-btn').onclick = () => this.copyToClipboard('share-link', 'Link copied!');
            document.getElementById('copy-embed-btn').onclick = () => this.copyToClipboard('embed-code', 'Embed code copied!');
        }

        this.elements.shareDialog.showModal();
    },

    copyToClipboard(elementId, successMessage) {
        const text = document.getElementById(elementId).textContent;
        navigator.clipboard.writeText(text).then(() => {
            this.showToast(successMessage, 'success');
        }).catch(() => {
            this.showToast('Could not copy to clipboard.', 'error');
        });
    },

    generateQRCode(text) {
        const qr = qrcode(0, 'L');
        qr.addData(text);
        qr.make();
        document.getElementById('qr-canvas').innerHTML = qr.createImgTag(5);
    },

    handleURLParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const file = urlParams.get('file');
        const pdfData = urlParams.get('pdf');

        if (file) {
            const decodedFile = decodeURIComponent(file);
            this.currentFileName = decodedFile.split('/').pop() || 'document.pdf';
            this.loadPDF(decodedFile, true);
        } else if (pdfData) {
            this.loadPDF('data:application/pdf;base64,' + pdfData, false);
        } else {
            this.elements.uploadDialog.showModal();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
