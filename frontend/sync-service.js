const SYNC_INTERVAL = 20 * 60 * 1000;
const API_BASE_URL = "http://localhost:5000/api";
let syncTimer = null;
let isReading = false;
let lastSyncTime = 0;

function getAuthToken() {
    return localStorage.getItem('pdf_reader_token');
}

function initSyncService() {
    console.log("🔄 Serviço de sincronização inicializado");
    document.addEventListener('mousemove', () => {
        isReading = true;
    });
    document.addEventListener('keydown', () => {
        isReading = true;
    });
    startPeriodicSync();
}

function startPeriodicSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
        if (isReading && currentPDFPath) {
            syncProgressToDatabase();
        }
    }, SYNC_INTERVAL);
}

async function syncProgressToDatabase() {
    const token = getAuthToken();
    if (!currentPDFPath || !token) {
        console.log("⏭️ Sincronização pulada: sem PDF aberto ou token");
        return;
    }

    try {
        const now = Date.now();
        if (now - lastSyncTime < 60000) {
            return;
        }
        console.log("🔄 Sincronizando progresso com MongoDB...");

        const response = await fetch(`${API_BASE_URL}/reading-progress/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({
                pdfName: pdfTitleEl.textContent,
                pdfPath: currentPDFPath,
                currentPage: currentPage,
                totalPages: totalPages,
                readingMode: readingMode,
                scrollPosition: canvasContainer.scrollTop || 0
            })
        });

        if (response.ok) {
            lastSyncTime = now;
            console.log("✅ Progresso sincronizado com sucesso");
        } else {
            console.warn("⚠️ Erro ao sincronizar progresso:", response.status);
        }
    } catch (error) {
        console.error("❌ Erro ao sincronizar com MongoDB:", error);
    }
}

async function getProgressFromDatabase(pdfPath) {
    const token = getAuthToken();
    if (!token) {
        console.log("⏭️ Sem token de autenticação");
        return null;
    }
    try {
        console.log("📥 Obtendo progresso do MongoDB...");

        const response = await fetch(`${API_BASE_URL}/reading-progress/${encodeURIComponent(pdfPath)}`, {
            method: 'GET',
            headers: {
                'Authorization': token
            }
        });

        if (response.ok) {
            const progress = await response.json();
            console.log("✅ Progresso obtido do banco:", progress);
            return progress;
        } else if (response.status === 404) {
            console.log("ℹ️ Nenhum progresso anterior encontrado");
            return null;
        } else {
            console.warn("⚠️ Erro ao obter progresso:", response.status);
            return null;
        }
    } catch (error) {
        console.error("❌ Erro ao obter progresso do MongoDB:", error);
        return null;
    }
}

async function restoreLatestProgress(pdfPath) {
    if (!pdfDocument) return;

    try {
        const localProgress = await loadPDFData(pdfPath);
        const dbProgress = await getProgressFromDatabase(pdfPath);
        let latestProgress = null;
        let source = "local";

        if (localProgress && dbProgress) {
            const localTime = localProgress.lastAccess || 0;
            const dbTime = new Date(dbProgress.lastUpdated).getTime();

            if (dbTime > localTime) {
                latestProgress = dbProgress;
                source = "database";
            } else {
                latestProgress = localProgress;
                source = "local";
            }
        } else if (dbProgress) {
            latestProgress = dbProgress;
            source = "database";
        } else if (localProgress) {
            latestProgress = localProgress;
            source = "local";
        }

        if (latestProgress) {
            console.log(`📖 Restaurando progresso de ${source}:`, latestProgress);
            currentPage = Math.min(latestProgress.currentPage || 1, totalPages);
            readingMode = latestProgress.readingMode || "pagination";
            document.querySelectorAll('input[name="reading-mode"]').forEach(radio => {
                radio.checked = radio.value === readingMode;
            });
            pageNumberInput.value = currentPage;
            if (readingMode === "pagination") {
                await renderPage(currentPage);
            } else {
                await renderScrollMode();
                if (latestProgress.scrollPosition) {
                    canvasContainer.scrollTop = latestProgress.scrollPosition;
                }
            }
            showStatus(`📖 Progresso restaurado de ${source} - Página ${currentPage}`);
        }
    } catch (error) {
        console.error("❌ Erro ao restaurar progresso:", error);
    }
}

async function saveCitationToDatabase(pdfName, pdfPath, text, page, notes = "") {
    const token = getAuthToken();
    if (!token) {
        console.log("⏭️ Sem token de autenticação");
        return false;
    }

    try {
        console.log("💾 Salvando citação no MongoDB...");

        const response = await fetch(`${API_BASE_URL}/citations/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({
                pdfName: pdfName,
                pdfPath: pdfPath,
                text: text,
                page: page,
                notes: notes,
                color: "yellow"
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log("✅ Citação salva com sucesso:", data);
            return true;
        } else {
            console.warn("⚠️ Erro ao salvar citação:", response.status);
            return false;
        }
    } catch (error) {
        console.error("❌ Erro ao salvar citação no MongoDB:", error);
        return false;
    }
}

async function getCitationsFromDatabase(pdfPath) {
    const token = getAuthToken();
    if (!token) {
        console.log("⏭️ Sem token de autenticação");
        return [];
    }

    try {
        console.log("📥 Obtendo citações do MongoDB...");

        const response = await fetch(`${API_BASE_URL}/citations/pdf/${encodeURIComponent(pdfPath)}`, {
            method: 'GET',
            headers: {
                'Authorization': token
            }
        });

        if (response.ok) {
            const citations = await response.json();
            console.log("✅ Citações obtidas:", citations);
            return citations;
        } else if (response.status === 404) {
            console.log("ℹ️ Nenhuma citação encontrada");
            return [];
        } else {
            console.warn("⚠️ Erro ao obter citações:", response.status);
            return [];
        }
    } catch (error) {
        console.error("❌ Erro ao obter citações do MongoDB:", error);
        return [];
    }
}

async function deleteCitationFromDatabase(citationId) {
    const token = getAuthToken();
    if (!token) {
        console.log("⏭️ Sem token de autenticação");
        return false;
    }

    try {
        console.log("🗑️ Deletando citação do MongoDB...");

        const response = await fetch(`${API_BASE_URL}/citations/${citationId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': token
            }
        });

        if (response.ok) {
            console.log("✅ Citação deletada com sucesso");
            return true;
        } else {
            console.warn("⚠️ Erro ao deletar citação:", response.status);
            return false;
        }
    } catch (error) {
        console.error("❌ Erro ao deletar citação do MongoDB:", error);
        return false;
    }
}

async function updateCitationInDatabase(citationId, text, notes) {
    const token = getAuthToken();
    if (!token) {
        console.log("⏭️ Sem token de autenticação");
        return false;
    }

    try {
        console.log("✏️ Atualizando citação no MongoDB...");

        const response = await fetch(`${API_BASE_URL}/citations/${citationId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({
                text: text,
                notes: notes
            })
        });

        if (response.ok) {
            console.log("✅ Citação atualizada com sucesso");
            return true;
        } else {
            console.warn("⚠️ Erro ao atualizar citação:", response.status);
            return false;
        }
    } catch (error) {
        console.error("❌ Erro ao atualizar citação no MongoDB:", error);
        return false;
    }
}

async function exportCitations(citationIds, format, style) {
    const token = getAuthToken();
    if (!token) {
        console.log("⏭️ Sem token de autenticação");
        return false;
    }

    try {
        console.log(`📤 Exportando citações em ${format} (estilo: ${style})...`);

        const endpoint = `${API_BASE_URL}/export/${format}`;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({
                citationIds: citationIds,
                style: style,
                pdfName: pdfTitleEl.textContent
            })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const timestamp = new Date().toISOString().slice(0, 10);
            const ext = format === 'docx' ? 'docx' : format;
            a.download = `citacoes_${timestamp}.${ext}`;
            
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            console.log("✅ Citações exportadas com sucesso");
            return true;
        } else {
            console.warn("⚠️ Erro ao exportar citações:", response.status);
            return false;
        }
    } catch (error) {
        console.error("❌ Erro ao exportar citações:", error);
        return false;
    }
}

function stopSyncService() {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
        console.log("⏹️ Serviço de sincronização parado");
    }
}

async function forceSyncNow() {
    console.log("⚡ Sincronizando agora...");
    await syncProgressToDatabase();
}
