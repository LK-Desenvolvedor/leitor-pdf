let selectedCitations = new Set();
let editingCitationId = null;
let allCitations = [];

const citationsModal = document.getElementById('citations-modal');
const editCitationModal = document.getElementById('edit-citation-modal');
const closeCitationsModal = document.getElementById('close-citations-modal');
const closeEditModal = document.getElementById('close-edit-modal');
const manageCitationsBtn = document.getElementById('manage-citations-btn');
const exportCitationsBtn = document.getElementById('export-citations-btn');
const selectAllBtn = document.getElementById('select-all-citations-btn');
const deselectAllBtn = document.getElementById('deselect-all-citations-btn');
const deleteSelectedBtn = document.getElementById('delete-selected-citations-btn');
const doExportBtn = document.getElementById('do-export-btn');
const saveEditBtn = document.getElementById('save-edit-citation-btn');
const cancelEditBtn = document.getElementById('cancel-edit-citation-btn');
const citationsListModal = document.getElementById('citations-list-modal');
const exportFormat = document.getElementById('export-format');
const exportStyle = document.getElementById('export-style');
const editCitationText = document.getElementById('edit-citation-text');
const editCitationNotes = document.getElementById('edit-citation-notes');

function openCitationsModal() {
    citationsModal.style.display = 'flex';
    loadCitationsForModal();
}

function closeCitationsModalFunc() {
    citationsModal.style.display = 'none';
    selectedCitations.clear();
}

function openEditModal(citationId, text, notes) {
    editingCitationId = citationId;
    editCitationText.value = text;
    editCitationNotes.value = notes;
    editCitationModal.style.display = 'flex';
}

function closeEditModalFunc() {
    editCitationModal.style.display = 'none';
    editingCitationId = null;
    editCitationText.value = '';
    editCitationNotes.value = '';
}

async function loadCitationsForModal() {
    if (!currentPDFPath) {
        citationsListModal.innerHTML = '<p style="opacity: 0.6;">Nenhum PDF aberto</p>';
        return;
    }

    try {
        const localData = await loadPDFData(currentPDFPath);
        const localCitations = localData?.citations || [];
        let dbCitations = [];
        const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
        if (token) {
            dbCitations = await getCitationsFromDatabase(currentPDFPath);
        }

        allCitations = [...localCitations];
        dbCitations.forEach(dbC => {
            const exists = allCitations.some(localC => localC.text === dbC.text && localC.page === dbC.page);
            if (!exists) {
                allCitations.push(dbC);
            } else {
                const localIdx = allCitations.findIndex(localC => localC.text === dbC.text && localC.page === dbC.page);
                allCitations[localIdx]._id = dbC._id;
            }
        });

        if (allCitations.length === 0) {
            citationsListModal.innerHTML = '<p style="opacity: 0.6;">Nenhuma citação encontrada</p>';
            return;
        }

        citationsListModal.innerHTML = '';
        allCitations.forEach((citation, index) => {
            const citationItem = document.createElement('div');
            citationItem.className = 'citation-item-modal';
            citationItem.innerHTML = `
                <input type="checkbox" data-index="${index}" class="citation-checkbox">
                <div class="citation-item-modal-content">
                    <div class="citation-item-modal-text">"${escapeHtml(citation.text.substring(0, 100))}..."</div>
                    <div class="citation-item-modal-page">Página ${citation.page} ${citation.notes ? '| ' + escapeHtml(citation.notes.substring(0, 50)) : ''}</div>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="btn-small edit-citation-btn" data-index="${index}">✏️</button>
                    <button class="btn-small delete-citation-btn" data-index="${index}">🗑️</button>
                </div>
            `;

            const checkbox = citationItem.querySelector('.citation-checkbox');
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedCitations.add(index);
                } else {
                    selectedCitations.delete(index);
                }
            });

            const editBtn = citationItem.querySelector('.edit-citation-btn');
            editBtn.addEventListener('click', () => {
                openEditModal(index, citation.text, citation.notes || '');
            });

            const deleteBtn = citationItem.querySelector('.delete-citation-btn');
            deleteBtn.addEventListener('click', async () => {
                if (confirm('Tem certeza que deseja deletar esta citação?')) {
                    const localData = await loadPDFData(currentPDFPath);
                    if (localData?.citations) {
                        localData.citations = localData.citations.filter(c => !(c.text === citation.text && c.page === citation.page));
                        await savePDFData(currentPDFPath, { citations: localData.citations });
                    }
                    if (citation._id && typeof deleteCitationFromDatabase === 'function') {
                        await deleteCitationFromDatabase(citation._id);
                    }
                    loadCitationsForModal();
                    renderAnnotations(await loadPDFData(currentPDFPath));
                    showStatus('Citação deletada');
                }
            });
            citationsListModal.appendChild(citationItem);
        });
    } catch (error) {
        console.error('Erro ao carregar citações:', error);
        citationsListModal.innerHTML = '<p style="color: #ff8888;">Erro ao carregar citações</p>';
    }
}

function selectAllCitations() {
    selectedCitations.clear();
    allCitations.forEach((_, index) => {
        selectedCitations.add(index);
        const checkbox = document.querySelector(`input[data-index="${index}"]`);
        if (checkbox) checkbox.checked = true;
    });
}

function deselectAllCitations() {
    selectedCitations.clear();
    document.querySelectorAll('.citation-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
}

async function deleteSelectedCitations() {
    if (selectedCitations.size === 0) {
        showStatus('Selecione pelo menos uma citação', true);
        return;
    }

    if (!confirm(`Deletar ${selectedCitations.size} citação(ões)?`)) {
        return;
    }

    try {
        const localData = await loadPDFData(currentPDFPath);
        const indicesToDelete = Array.from(selectedCitations).sort((a, b) => b - a);
        const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
        const citationIds = indicesToDelete
            .map(index => allCitations[index]?._id)
            .filter(id => id);

        if (localData?.citations) {
            indicesToDelete.forEach(index => {
                const citation = allCitations[index];
                localData.citations = localData.citations.filter(c => !(c.text === citation.text && c.page === citation.page));
            });
            await savePDFData(currentPDFPath, { citations: localData.citations });
        }

        if (citationIds.length > 0 && token) {
            await deleteCitationsFromDatabase(citationIds);
        }
        selectedCitations.clear();
        loadCitationsForModal();
        renderAnnotations(await loadPDFData(currentPDFPath));
        showStatus('Citações deletadas com sucesso');
    } catch (error) {
        console.error('Erro ao deletar citações:', error);
        showStatus('Erro ao deletar citações', true);
    }
}

async function doExportCitations() {
    if (selectedCitations.size === 0) {
        showStatus('Selecione pelo menos uma citação para exportar', true);
        return;
    }

    try {
        const format = exportFormat.value;
        const style = exportStyle.value;
        const citationIds = Array.from(selectedCitations)
            .map(index => allCitations[index]?._id)
            .filter(id => id);

        if (citationIds.length === 0) {
            showStatus('Nenhuma citação sincronizada com o banco para exportar. Salve-as primeiro!', true);
            return;
        }

        showStatus(`📤 Exportando ${selectedCitations.size} citação(ões)...`);
        const success = await exportCitations(citationIds, format, style);

        if (success) {
            showStatus(`✅ Citações exportadas em ${format.toUpperCase()}`);
            closeCitationsModalFunc();
        } else {
            showStatus('Erro ao exportar citações', true);
        }
    } catch (error) {
        console.error('Erro ao exportar:', error);
        showStatus('Erro ao exportar citações', true);
    }
}

async function saveEditCitation() {
    if (editingCitationId === null) return;

    const text = editCitationText.value.trim();
    const notes = editCitationNotes.value.trim();

    if (!text) {
        showStatus('O texto da citação não pode estar vazio', true);
        return;
    }

    try {
        const citation = allCitations[editingCitationId];
        const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
        const localData = await loadPDFData(currentPDFPath);
        if (localData?.citations) {
            const localIdx = localData.citations.findIndex(c => c.text === citation.text && c.page === citation.page);
            if (localIdx !== -1) {
                localData.citations[localIdx].text = text;
                localData.citations[localIdx].notes = notes;
                await savePDFData(currentPDFPath, { citations: localData.citations });
            }
        }

        if (citation._id && token && typeof updateCitationInDatabase === 'function') {
            await updateCitationInDatabase(citation._id, text, notes);
        }

        closeEditModalFunc();
        loadCitationsForModal();
        renderAnnotations(await loadPDFData(currentPDFPath));
        showStatus('Citação atualizada com sucesso');
    } catch (error) {
        console.error('Erro ao salvar citação:', error);
        showStatus('Erro ao salvar citação', true);
    }
}

async function deleteCitationsFromDatabase(citationIds) {
    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE_URL}/citations/delete-multiple`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ citationIds })
        });

        if (!response.ok) {
            console.warn('Erro ao deletar citações do banco:', response.status);
        }
    } catch (error) {
        console.error('Erro ao deletar citações do banco:', error);
    }
}

if (manageCitationsBtn) {
    manageCitationsBtn.addEventListener('click', openCitationsModal);
}

if (closeCitationsModal) {
    closeCitationsModal.addEventListener('click', closeCitationsModalFunc);
}

if (closeEditModal) {
    closeEditModal.addEventListener('click', closeEditModalFunc);
}

if (selectAllBtn) {
    selectAllBtn.addEventListener('click', selectAllCitations);
}

if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', deselectAllCitations);
}

if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', deleteSelectedCitations);
}

if (doExportBtn) {
    doExportBtn.addEventListener('click', doExportCitations);
}

if (saveEditBtn) {
    saveEditBtn.addEventListener('click', saveEditCitation);
}

if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', closeEditModalFunc);
}

citationsModal.addEventListener('click', (e) => {
    if (e.target === citationsModal) {
        closeCitationsModalFunc();
    }
});

editCitationModal.addEventListener('click', (e) => {
    if (e.target === editCitationModal) {
        closeEditModalFunc();
    }
});
