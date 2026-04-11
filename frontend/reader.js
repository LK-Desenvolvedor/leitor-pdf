function checkAuthentication() {
    const token = localStorage.getItem('pdf_reader_token');
    const user = localStorage.getItem('pdf_reader_user');
    
    if (!token || !user) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

if (!checkAuthentication()) {
    throw new Error('Usuário não autenticado');
}

const DB_NAME = "PDFReaderLocalDB";
const DB_VERSION = 2;
const AUTH_URL = "http://localhost:5000/auth";
let db = null;
let authToken = localStorage.getItem('pdf_reader_token');
let userData = JSON.parse(localStorage.getItem('pdf_reader_user') || 'null');
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
let readingMode = "pagination";
let scrollPages = [];

const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');
const pdfListEl = document.getElementById('pdf-list');
const bookmarksListEl = document.getElementById('bookmarks-list');
const citationsListEl = document.getElementById('citations-list');
const pdfTitleEl = document.getElementById('pdf-title');
const pageNumberInput = document.getElementById('page-number');
const totalPagesSpan = document.getElementById('total-pages');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const addBookmarkBtn = document.getElementById('add-bookmark-btn');
const addCitationBtn = document.getElementById('add-citation-btn');
const selectFolderBtn = document.getElementById('select-folder-btn');
const statusMsg = document.getElementById('status-message');
const canvasContainer = document.getElementById('canvas-container');
const readingModeRadios = document.querySelectorAll('input[name="reading-mode"]');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const resetZoomBtn = document.getElementById('reset-zoom-btn');
const logoutBtn = document.getElementById('logout-btn');

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

function showStatus(msg, isError = false) {
    statusMsg.innerHTML = msg;
    statusMsg.style.color = isError ? "#ffaa88" : "#aaffcc";
    setTimeout(() => {
        if (statusMsg.innerHTML === msg) statusMsg.style.color = "#eef";
    }, 2500);
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

function handleLogout() {
    localStorage.removeItem('pdf_reader_token');
    localStorage.removeItem('pdf_reader_user');
    window.location.href = 'index.html';
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
    for await (const entry of dirHandle.values()) {
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

async function openPDF(fileHandle, filePath, fileName) {
    if (pdfDocument) {
        pdfDocument.destroy();
        pdfDocument = null;
    }
    currentPDFHandle = fileHandle;
    currentPDFPath = filePath;
    pdfTitleEl.textContent = fileName;
    renderPDFList();
    try {
        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        pdfDocument = await pdfjsLib.getDocument({ 
            url, 
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/', 
            cMapPacked: true 
        }).promise;
        URL.revokeObjectURL(url);
        totalPages = pdfDocument.numPages;
        totalPagesSpan.textContent = `/ ${totalPages}`;
        pageNumberInput.max = totalPages;
        pageNumberInput.disabled = false;
        prevBtn.disabled = false;
        nextBtn.disabled = false;
        if (authToken) {
            await restoreLatestProgress(filePath);
        } else {
            const savedData = await loadPDFData(filePath);
            currentPage = (savedData && savedData.lastPage) ? Math.min(savedData.lastPage, totalPages) : 1;
            pageNumberInput.value = currentPage;
            
            if (readingMode === "pagination") {
                await renderPage(currentPage);
            } else {
                await renderScrollMode();
            }
            renderAnnotations(savedData);
            showStatus(`📖 "${fileName}" - Página ${currentPage} restaurada localmente.`);
        }

        updateNavButtons();
    } catch (err) {
        console.error(err);
        showStatus("Erro ao abrir PDF: " + err.message, true);
        pdfTitleEl.textContent = "Erro ao carregar";
    }
}

async function renderPage(pageNum) {
    if (!pdfDocument) return;
    pageNum = parseInt(pageNum);
    if (pageNum < 1) pageNum = 1;
    if (pageNum > totalPages) pageNum = totalPages;
    currentPage = pageNum;
    pageNumberInput.value = currentPage;

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
    textLayerDiv = document.getElementById('text-layer');
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
    savePDFData(currentPDFPath, { lastPage: currentPage });
    if (authToken && typeof syncProgressToDatabase === 'function') {
        syncProgressToDatabase();
    }
}

async function renderScrollMode() {
    if (!pdfDocument) return;
    canvasContainer.classList.add('scroll-mode');
    const wrapper = document.getElementById('pdf-canvas-wrapper');
    wrapper.innerHTML = '';
    scrollPages = [];

    for (let i = 1; i <= totalPages; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'scroll-page';
        pageDiv.style.position = 'relative';
        pageDiv.style.marginBottom = '20px';
        
        const pageCanvas = document.createElement('canvas');
        const pageTextLayer = document.createElement('div');
        pageTextLayer.className = 'text-layer';
        
        pageDiv.appendChild(pageCanvas);
        pageDiv.appendChild(pageTextLayer);
        wrapper.appendChild(pageDiv);
        
        const page = await pdfDocument.getPage(i);
        const viewport = page.getViewport({ scale: currentScale });
        pageCanvas.width = viewport.width;
        pageCanvas.height = viewport.height;
        
        pageTextLayer.style.width = viewport.width + 'px';
        pageTextLayer.style.height = viewport.height + 'px';
        
        await page.render({ canvasContext: pageCanvas.getContext('2d'), viewport }).promise;
        const textContent = await page.getTextContent();
        await pdfjsLib.renderTextLayer({
            textContent,
            container: pageTextLayer,
            viewport,
            textDivs: [],
            enhanceTextSelection: true
        }).promise;
        
        scrollPages.push({ pageNum: i, element: pageDiv });
    }

    canvasContainer.addEventListener('scroll', handleScroll);
}

function handleScroll() {
    if (readingMode !== "scroll") return;
    const containerTop = canvasContainer.scrollTop;
    const activePage = scrollPages.find(p => p.element.offsetTop + p.element.offsetHeight > containerTop + 100);
    if (activePage && activePage.pageNum !== currentPage) {
        currentPage = activePage.pageNum;
        pageNumberInput.value = currentPage;
        savePDFData(currentPDFPath, { lastPage: currentPage, scrollPosition: containerTop });
        
        if (authToken && typeof syncProgressToDatabase === 'function') {
            syncProgressToDatabase();
        }
    }
}

function changeReadingMode(mode) {
    readingMode = mode;
    if (!pdfDocument) return;
    
    if (mode === "pagination") {
        canvasContainer.classList.remove('scroll-mode');
        const wrapper = document.getElementById('pdf-canvas-wrapper');
        wrapper.innerHTML = '<canvas id="pdf-canvas"></canvas><div id="text-layer" class="text-layer"></div>';
        renderPage(currentPage);
    } else {
        renderScrollMode();
    }
}

function updateNavButtons() {
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
}

function goPrevPage() {
    if (currentPage <= 1) return;
    renderPage(currentPage - 1);
    updateNavButtons();
}

function goNextPage() {
    if (currentPage >= totalPages) return;
    renderPage(currentPage + 1);
    updateNavButtons();
}

function goToPage(num) {
    num = parseInt(num);
    if (isNaN(num) || num < 1 || num > totalPages) return;
    renderPage(num);
    updateNavButtons();
}

function zoomIn() {
    currentScale += 0.2;
    if (readingMode === "pagination") renderPage(currentPage);
    else renderScrollMode();
}

function zoomOut() {
    if (currentScale <= 0.5) return;
    currentScale -= 0.2;
    if (readingMode === "pagination") renderPage(currentPage);
    else renderScrollMode();
}

function resetZoom() {
    currentScale = 1.3;
    if (readingMode === "pagination") renderPage(currentPage);
    else renderScrollMode();
}

async function addBookmark() {
    if (!currentPDFPath) return;
    const saved = await loadPDFData(currentPDFPath) || {};
    const bookmarks = saved.bookmarks || [];
    const id = Date.now();
    bookmarks.push({ id, page: currentPage, date: new Date().toLocaleString() });
    await savePDFData(currentPDFPath, { bookmarks });
    renderAnnotations(await loadPDFData(currentPDFPath));
    showStatus(`🔖 Marcador adicionado na página ${currentPage}`);
}

async function addCitation() {
    if (!currentPDFPath) return;
    const selection = window.getSelection().toString().trim();
    if (!selection) {
        showStatus("⚠️ Selecione um texto no PDF primeiro!", true);
        return;
    }

    const notes = prompt("Notas para esta citação (opcional):", "");
    const saved = await loadPDFData(currentPDFPath) || {};
    const citations = saved.citations || [];
    const id = Date.now();
    const newCitation = { id, text: selection, page: currentPage, notes: notes || "", date: new Date().toLocaleString() };
    
    citations.push(newCitation);
    await savePDFData(currentPDFPath, { citations });
    if (authToken && typeof saveCitationToDatabase === 'function') {
        await saveCitationToDatabase(pdfTitleEl.textContent, currentPDFPath, selection, currentPage, notes || "");
    }
    
    renderAnnotations(await loadPDFData(currentPDFPath));
    showStatus(`✨ Citação salva da página ${currentPage}`);
}

function renderAnnotations(data) {
    bookmarksListEl.innerHTML = "";
    citationsListEl.innerHTML = "";
    if (!data) return;
    if (data.bookmarks && data.bookmarks.length) {
        data.bookmarks.forEach(bm => {
            const li = document.createElement('li');
            li.innerHTML = `<span>Página ${bm.page} <small>(${bm.date})</small></span>
                            <button class="delete-anno" data-id="${bm.id}">🗑️</button>`;
            li.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-anno')) return;
                goToPage(bm.page);
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
    if (data.citations && data.citations.length) {
        data.citations.forEach(c => {
            const li = document.createElement('li');
            const preview = escapeHtml(c.text.substring(0, 50));
            li.innerHTML = `<span><em>"${preview}..."</em> <span style="font-size:0.7rem;">p.${c.page}</span></span>
                            <button class="delete-anno" data-id="${c.id}">🗑️</button>`;
            li.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-anno')) return;
                goToPage(c.page);
            });
            const delBtn = li.querySelector('.delete-anno');
            if (delBtn) delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteAnnotation('citation', c.id, currentPDFPath);
            });
            citationsListEl.appendChild(li);
        });
    } else {
        citationsListEl.innerHTML = '<li style="opacity:0.6;">Nenhuma citação salva</li>';
    }
}

async function deleteAnnotation(type, id, filePath) {
    const saved = await loadPDFData(filePath);
    if (!saved) return;
    
    if (type === 'bookmark') {
        saved.bookmarks = (saved.bookmarks || []).filter(b => b.id !== id);
    } else if (type === 'citation') {
        const citation = (saved.citations || []).find(c => c.id === id);
        if (citation && citation._id && authToken && typeof deleteCitationFromDatabase === 'function') {
            await deleteCitationFromDatabase(citation._id);
        }
        saved.citations = (saved.citations || []).filter(c => c.id !== id);
    }
    
    await savePDFData(filePath, { 
        bookmarks: saved.bookmarks, 
        citations: saved.citations 
    });
    renderAnnotations(await loadPDFData(filePath));
    showStatus(`Anotação removida.`);
}

selectFolderBtn.addEventListener('click', selectFolder);
prevBtn.addEventListener('click', goPrevPage);
nextBtn.addEventListener('click', goNextPage);
pageNumberInput.addEventListener('change', () => goToPage(pageNumberInput.value));
addBookmarkBtn.addEventListener('click', addBookmark);
addCitationBtn.addEventListener('click', addCitation);

readingModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        changeReadingMode(e.target.value);
    });
});

zoomInBtn.addEventListener('click', zoomIn);
zoomOutBtn.addEventListener('click', zoomOut);
resetZoomBtn.addEventListener('click', resetZoom);
logoutBtn.addEventListener('click', handleLogout);

(async () => {
    db = await openDB();
    showStatus("📂 Clique em 'Selecionar Pasta' para começar a ler seus PDFs");

    if (authToken && typeof initSyncService === 'function') {
        initSyncService();
    }
})();

document.getElementById('canvas-container').addEventListener('dblclick', () => {
    if (pdfDocument && readingMode === "pagination") {
        renderPage(currentPage);
    }
});
