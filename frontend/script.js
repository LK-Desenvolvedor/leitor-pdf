    const DB_NAME = "PDFReaderLocalDB";
    const DB_VERSION = 1;
    let db = null;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains("pdfData")) {
                    const store = db.createObjectStore("pdfData", { keyPath: "filePath" });
                    store.createIndex("lastAccess", "lastAccess");
                }
            };
        });
    }

    async function savePDFData(filePath, data) {
        if (!db) db = await openDB();
        const tx = db.transaction("pdfData", "readwrite");
        const store = tx.objectStore("pdfData");
        const existing = await new Promise((resolve) => {
            const getReq = store.get(filePath);
            getReq.onsuccess = () => resolve(getReq.result || {});
            getReq.onerror = () => resolve({});
        });
        const merged = { ...existing, ...data, filePath, lastAccess: Date.now() };
        store.put(merged);
        return tx.complete;
    }

    async function loadPDFData(filePath) {
        if (!db) db = await openDB();
        const tx = db.transaction("pdfData", "readonly");
        const store = tx.objectStore("pdfData");
        return new Promise((resolve) => {
            const getReq = store.get(filePath);
            getReq.onsuccess = () => resolve(getReq.result || null);
            getReq.onerror = () => resolve(null);
        });
    }

    let currentFolderHandle = null;    
    let pdfFilesList = [];              
    let currentPDFPath = null;          
    let currentPDFHandle = null;
    let pdfDocument = null;
    let currentPage = 1;
    let totalPages = 0;
    let currentScale = 1.3;                
    let renderTask = null;
    let textLayerDiv = null;
    let canvas = document.getElementById('pdf-canvas');
    let ctx = canvas.getContext('2d');

    // Elementos DOM
    const pdfListEl = document.getElementById('pdf-list');
    const bookmarksListEl = document.getElementById('bookmarks-list');
    const highlightsListEl = document.getElementById('highlights-list');
    const pdfTitleEl = document.getElementById('pdf-title');
    const pageNumberInput = document.getElementById('page-number');
    const totalPagesSpan = document.getElementById('total-pages');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');
    const addHighlightBtn = document.getElementById('add-highlight-btn');
    const selectFolderBtn = document.getElementById('select-folder-btn');
    const statusMsg = document.getElementById('status-message');
    const goToBookmarkBtn = document.getElementById('go-to-bookmark');

    function showStatus(msg, isError = false) {
        statusMsg.innerHTML = msg;
        statusMsg.style.color = isError ? "#ffaa88" : "#aaffcc";
        setTimeout(() => {
            if (statusMsg.innerHTML === msg) statusMsg.style.color = "#eef";
        }, 2500);
    }
    async function verifyPermission(handle) {
        const options = { mode: 'read' };

        if ((await handle.queryPermission(options)) === 'granted') {
            return true;
        }

        if ((await handle.requestPermission(options)) === 'granted') {
            return true;
        }

        return false;
    }
    async function scanDirectory(dirHandle, relativePath = "") {
        let pdfs = [];
        console.log("Testando leitura da pasta...");
        for await (const entry of dirHandle.values()) {
            console.log("ACHOU:", entry.name, entry.kind);
            const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".pdf")) {
                pdfs.push({
                    name: entry.name,
                    path: entryPath,
                    handle: entry
                });
            } else if (entry.kind === "directory") {
                const subPdfs = await scanDirectory(entry, entryPath);
                pdfs.push(...subPdfs);
            }
        }
        return pdfs;
    }

    async function loadPDFListFromFolder(folderHandle) {
        try {
            showStatus("🔍 Lendo PDFs da pasta...");
            const pdfs = await scanDirectory(folderHandle);
            pdfFilesList = pdfs;
            renderPDFList();
            if (pdfs.length === 0) {
                showStatus("⚠️ Nenhum PDF encontrado na pasta selecionada.", true);
            } else {
                showStatus(`📚 ${pdfs.length} PDF(s) encontrados. Clique em um para ler.`);
            }
        } catch (err) {
            console.error(err);
            showStatus("Erro ao ler pasta: " + err.message, true);
        }
    }

    function renderPDFList() {
        pdfListEl.innerHTML = "";
        for (const pdf of pdfFilesList) {
            const li = document.createElement('li');
            li.textContent = pdf.name;
            li.title = pdf.path;
            if (currentPDFPath === pdf.path) li.classList.add('active-pdf');
            li.addEventListener('click', () => openPDF(pdf.handle, pdf.path, pdf.name));
            pdfListEl.appendChild(li);
        }
    }

    async function openPDF(fileHandle, filePath, fileName) {
        if (pdfDocument) {
            pdfDocument.destroy();
            pdfDocument = null;
        }
        currentPDFHandle = fileHandle;
        currentPDFPath = filePath;
        pdfTitleEl.textContent = fileName;
        try {
            const file = await fileHandle.getFile();
            const arrayBuffer = await file.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            pdfDocument = await pdfjsLib.getDocument({ url, cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/', cMapPacked: true }).promise;
            URL.revokeObjectURL(url);
            totalPages = pdfDocument.numPages;
            totalPagesSpan.textContent = `/ ${totalPages}`;
            pageNumberInput.max = totalPages;
            pageNumberInput.disabled = false;
            prevBtn.disabled = false;
            nextBtn.disabled = false;
            const savedData = await loadPDFData(filePath);
            let lastPage = 1;
            if (savedData && savedData.lastPage && savedData.lastPage <= totalPages) {
                lastPage = savedData.lastPage;
            }
            currentPage = lastPage;
            pageNumberInput.value = currentPage;
            await renderPage(currentPage);
            updateNavButtons();
            renderAnnotations(savedData);
            showStatus(`📖 "${fileName}" - Página ${currentPage} restaurada.`);
        } catch (err) {
            console.error(err);
            showStatus("Erro ao abrir PDF: " + err.message, true);
            pdfTitleEl.textContent = "Erro ao carregar";
        }
    }

    async function renderPage(pageNum) {
        if (!pdfDocument) return;
        if (pageNum < 1) pageNum = 1;
        if (pageNum > totalPages) pageNum = totalPages;
        if (renderTask) {
            renderTask.cancel();
        }
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport,
        };
        renderTask = page.render(renderContext);
        await renderTask.promise;
        renderTask = null;
        const textContent = await page.getTextContent();
        const textLayerDiv = document.getElementById('text-layer');
        textLayerDiv.style.width = viewport.width + 'px';
        textLayerDiv.style.height = viewport.height + 'px';
        textLayerDiv.innerHTML = '';
        const renderTextLayer = pdfjsLib.renderTextLayer({
            textContent: textContent,
            container: textLayerDiv,
            viewport: viewport,
            textDivs: [],
            enhanceTextSelection: true
        });
        await renderTextLayer.promise;
        const wrapper = document.getElementById('pdf-canvas-wrapper');
        wrapper.style.width = viewport.width + 'px';
        wrapper.style.height = viewport.height + 'px';
        if (currentPDFPath) {
            await savePDFData(currentPDFPath, { lastPage: pageNum });
        }
        currentPage = pageNum;
        pageNumberInput.value = pageNum;
        updateNavButtons();
    }

    function updateNavButtons() {
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
    }

    async function goPrevPage() {
        if (currentPage > 1) {
            await renderPage(currentPage - 1);
        }
    }
    async function goNextPage() {
        if (currentPage < totalPages) {
            await renderPage(currentPage + 1);
        }
    }
    async function goToPage(page) {
        let p = parseInt(page);
        if (isNaN(p)) p = 1;
        p = Math.min(totalPages, Math.max(1, p));
        await renderPage(p);
    }

    async function addBookmark() {
        if (!currentPDFPath) {
            showStatus("Nenhum PDF aberto.", true);
            return;
        }
        const name = prompt("Nome do marcador (ex: Capítulo 3):", `Página ${currentPage}`);
        if (!name) return;
        const saved = await loadPDFData(currentPDFPath);
        const bookmarks = saved?.bookmarks || [];
        bookmarks.push({ name: name.trim(), page: currentPage, id: Date.now() });
        await savePDFData(currentPDFPath, { bookmarks });
        const updated = await loadPDFData(currentPDFPath);
        renderAnnotations(updated);
        showStatus(`✅ Marcador "${name}" adicionado na página ${currentPage}`);
    }

    async function addHighlightFromSelection() {
        if (!currentPDFPath) {
            showStatus("Abra um PDF primeiro.", true);
            return;
        }
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        if (!selectedText) {
            showStatus("❌ Nenhum texto selecionado. Selecione um trecho no PDF.", true);
            return;
        }
        const saved = await loadPDFData(currentPDFPath);
        const highlights = saved?.highlights || [];
        highlights.push({ text: selectedText.substring(0, 280), page: currentPage, timestamp: Date.now() });
        await savePDFData(currentPDFPath, { highlights });
        const updated = await loadPDFData(currentPDFPath);
        renderAnnotations(updated);
        showStatus(`✍️ Trecho salvo da página ${currentPage}: "${selectedText.substring(0, 50)}..."`);
        selection.removeAllRanges();
    }

    function renderAnnotations(data) {
        bookmarksListEl.innerHTML = '';
        highlightsListEl.innerHTML = '';
        if (!data) return;
        if (data.bookmarks && data.bookmarks.length) {
            data.bookmarks.forEach(bm => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>🔖 ${escapeHtml(bm.name)}</strong> <span style="font-size:0.7rem;">(pág. ${bm.page})</span>
                                <button class="delete-anno" data-type="bookmark" data-id="${bm.id}" data-page="${bm.page}">🗑️</button>`;
                li.addEventListener('click', (e) => {
                    if (e.target.classList.contains('delete-anno')) return;
                    goToPage(bm.page);
                    showStatus(`Navegando para: ${bm.name}`);
                });
                const delBtn = li.querySelector('.delete-anno');
                if (delBtn) delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await deleteAnnotation('bookmark', bm.id, currentPDFPath);
                });
                bookmarksListEl.appendChild(li);
            });
        } else {
            bookmarksListEl.innerHTML = '<li style="opacity:0.6;">Nenhum marcador ainda</li>';
        }

        if (data.highlights && data.highlights.length) {
            data.highlights.forEach(h => {
                const li = document.createElement('li');
                li.innerHTML = `<span>📌 <em>“${escapeHtml(h.text)}”</em></span> <span style="font-size:0.7rem;">p.${h.page}</span>
                                <button class="delete-anno" data-type="highlight" data-id="${h.timestamp}" data-page="${h.page}">🗑️</button>`;
                li.addEventListener('click', (e) => {
                    if (e.target.classList.contains('delete-anno')) return;
                    goToPage(h.page);
                    showStatus(`Indo para página ${h.page} - trecho destacado`);
                });
                const delBtn = li.querySelector('.delete-anno');
                if (delBtn) delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await deleteAnnotation('highlight', h.timestamp, currentPDFPath);
                });
                highlightsListEl.appendChild(li);
            });
        } else {
            highlightsListEl.innerHTML = '<li style="opacity:0.6;">Nenhum trecho marcado</li>';
        }
    }

    async function deleteAnnotation(type, id, filePath) {
        const saved = await loadPDFData(filePath);
        if (!saved) return;
        if (type === 'bookmark') {
            saved.bookmarks = (saved.bookmarks || []).filter(b => b.id !== id);
        } else if (type === 'highlight') {
            saved.highlights = (saved.highlights || []).filter(h => h.timestamp !== id);
        }
        await savePDFData(filePath, { bookmarks: saved.bookmarks, highlights: saved.highlights });
        const updated = await loadPDFData(filePath);
        renderAnnotations(updated);
        showStatus(`Anotação removida (sem alterar PDF original).`);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    async function selectFolder() {
        if (!window.showDirectoryPicker) {
            alert("Seu navegador não suporta a API File System Access. Use Chrome/Edge mais recente.");
            showStatus("Navegador incompatível. Use Chrome/Edge.", true);
            return;
        }
        try {
            const dirHandle = await window.showDirectoryPicker();
            const hasPermission = await verifyPermission(dirHandle);
            if (!hasPermission) {
            showStatus("❌ Permissão negada.", true);
            return;
            }
            currentFolderHandle = dirHandle;
            await loadPDFListFromFolder(dirHandle);
        } catch (err) {
            if (err.name !== 'AbortError') {
                showStatus("Erro ao selecionar pasta: " + err.message, true);
            }
        }
    }

    selectFolderBtn.addEventListener('click', selectFolder);
    prevBtn.addEventListener('click', goPrevPage);
    nextBtn.addEventListener('click', goNextPage);
    pageNumberInput.addEventListener('change', () => goToPage(pageNumberInput.value));
    addBookmarkBtn.addEventListener('click', addBookmark);
    addHighlightBtn.addEventListener('click', addHighlightFromSelection);
    goToBookmarkBtn.addEventListener('click', async () => {
        if (!currentPDFPath) return;
        const data = await loadPDFData(currentPDFPath);
        if (data && data.bookmarks && data.bookmarks.length) {
            const lastBookmark = data.bookmarks[data.bookmarks.length-1];
            if (lastBookmark) goToPage(lastBookmark.page);
            else showStatus("Nenhum marcador salvo.");
        } else {
            showStatus("Nenhum marcador disponível.", true);
        }
    });

    (async () => {
        db = await openDB();
        showStatus("📂 Clique em 'Selecionar Pasta' para começar a ler seus PDFs");
    })();

    document.getElementById('canvas-container').addEventListener('dblclick', () => {
        if (pdfDocument) renderPage(currentPage);
    });