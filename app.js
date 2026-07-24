import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyCT7bYMjc-r5LpwLM9SdiTKkEtP-IKOcro",
    authDomain: "memo-8ea40.firebaseapp.com",
    projectId: "memo-8ea40",
    storageBucket: "memo-8ea40.firebasestorage.app",
    messagingSenderId: "127177015064",
    appId: "1:127177015064:web:e9d006d90d6e28bf9fa86d"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 2. Supabase Config
const SUPABASE_URL = "https://slcjqnexveclbtvjxeuc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsY2pxbmV4dmVjbGJ0dmp4ZXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MTcwNTksImV4cCI6MjEwMDE5MzA1OX0.tZM3I7Kx8_ACL4_HzZRvqSr31OmfuueJs9_Ml7ldgHA"; 
const BUCKET_NAME = "memoiren-files";

// ==========================================
// حقن واجهة الخريطة الداخلية ديناميكياً (بدون لمس HTML)
// ==========================================
(function injectInternalMindmapUI() {
    const tabsContainer = document.querySelector('.tabs');
    const modalBody = document.querySelector('.modal-body');
    
    if (tabsContainer && modalBody) {
        // إضافة زر التبويب
        tabsContainer.insertAdjacentHTML('beforeend', `
            <button class="tab-btn" data-tab="internalMapTab">
                <svg class="tab-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v7M12 15v7M2 12h7M15 12h7"/></svg>
                Mindmap
            </button>
        `);

        // إضافة محتوى التبويب
        modalBody.insertAdjacentHTML('beforeend', `
            <div class="tab-content" id="internalMapTab" style="display: flex; flex-direction: column; height: 50vh; min-height: 400px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; gap: 10px;">
                    <button id="addInternalNodeBtn" class="add-item-btn" style="margin: 0; padding: 8px 15px;">+ Neue Node</button>
                    <label class="switch-container" style="margin: 0; background: #F2F7F4; padding: 5px 10px; border-radius: 20px;">
                        <span style="font-size: 12px;">Verbinden</span>
                        <input type="checkbox" id="internalConnectSwitch">
                        <span class="slider"></span>
                    </label>
                    <button id="deleteInternalNodeBtn" class="delete-btn" style="display: none; padding: 8px 15px; margin: 0;">Löschen</button>
                </div>
                <div id="internalMindmapContainer" style="flex-grow: 1; border: 2px solid #E4ECE7; border-radius: 12px; background: #FAFCFB;"></div>
            </div>
        `);
    }
})();

// 3. Global Variables
let nodesData = new vis.DataSet([]);
let edgesData = new vis.DataSet([]);
let activeBubbleId = null;
let currentAction = null;
let currentNotebookIndex = null;
let currentPageIndex = 0;
let activeGroupRecordingIndex = null;

// متغيرات الخريطة الداخلية
let internalNetwork = null;
let internalNodes = new vis.DataSet();
let internalEdges = new vis.DataSet();
let selectedInternalNodeId = null;

// 4. Mindmap Setup (تعديل الفيزياء لزيادة المسافة الوهمية بين الكرات)
const container = document.getElementById("mindmap");
const data = { nodes: nodesData, edges: edgesData };
const options = {
    nodes: {
        shape: "dot", 
        size: 22, // الحجم المرئي يبقى كما هو
        color: { 
            background: "#F2F7F4", border: "#E4ECE7", 
            highlight: { background: "#D9EBE4", border: "#C2DACF" } 
        },
        font: { family: "Plus Jakarta Sans", color: "#4A5D54", size: 14, face: "Plus Jakarta Sans" },
        borderWidth: 2, shadow: { enabled: true, color: "rgba(74, 93, 84, 0.04)", size: 12 }
    },
    edges: { color: { color: "#C2DACF", highlight: "#A7CBB9" }, smooth: { type: "continuous" }, width: 2 },
    physics: {
        enabled: false,
        solver: "barnesHut",
        barnesHut: {
            gravitationalConstant: -4000, // زيادة قوة التنافر
            centralGravity: 0.1,
            springLength: 200, // زيادة طول الروابط (المسافة بين الكرات)
            springConstant: 0.02,
            damping: 0.09,
            avoidOverlap: 1 // جعل حجم الكرات الوهمي كبير جداً لمنع اقترابها
        }
    },
    interaction: { hover: true, dragNodes: true },
    manipulation: { enabled: false, addEdge: async function(edgeData, callback) {
        if(edgeData.from !== edgeData.to) {
            await addDoc(collection(db, "connections"), { from: edgeData.from, to: edgeData.to });
            callback(edgeData);
        }
    }}
};
const network = new vis.Network(container, data, options);

network.on("dragStart", function (params) {
    if (params.nodes.length > 0) network.setOptions({ physics: { enabled: true } });
});

network.on("dragEnd", async function (params) {
    network.setOptions({ physics: { enabled: false } });
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const position = network.getPosition(nodeId);
        await updateDoc(doc(db, "bubbles", nodeId), { x: position.x, y: position.y });
    }
});

// 5. Firebase Sync
onSnapshot(collection(db, "bubbles"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        const d = change.doc.data();
        if (change.type === "added" || change.type === "modified") {
            nodesData.update({ id: change.doc.id, label: d.title, x: d.x, y: d.y, content: d.content });
            if(activeBubbleId === change.doc.id) renderContent(activeBubbleId);
        }
        if (change.type === "removed") nodesData.remove(change.doc.id);
    });
});
onSnapshot(collection(db, "connections"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") edgesData.update({ id: change.doc.id, from: change.doc.data().from, to: change.doc.data().to });
        if (change.type === "removed") edgesData.remove(change.doc.id);
    });
});

// 6. UI Interactions
document.getElementById("connectSwitch").addEventListener("change", (e) => {
    if (e.target.checked) network.addEdgeMode();
    else network.disableEditMode();
});

network.on("doubleClick", (params) => {
    if (params.nodes.length > 0) {
        activeBubbleId = params.nodes[0];
        const bubble = nodesData.get(activeBubbleId);
        document.getElementById("bubbleTitleInput").value = bubble.label;
        document.getElementById("contentModal").classList.add("active");
        renderContent(activeBubbleId);
    }
});

document.getElementById("bubbleBasket").addEventListener("dragend", async (e) => {
    const pos = network.DOMtoCanvas({ x: e.clientX, y: e.clientY });
    await addDoc(collection(db, "bubbles"), {
        title: "Neuer Gedanke", x: pos.x, y: pos.y,
        content: { quickNotes: [], notebooks: [], audioGroups: [], photos: [], internalNodes: [], internalEdges: [] }
    });
});

// 7. Supabase Upload Logic (مختصر)
async function uploadToSupabase(file) {
    try {
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${fileName}`;
        const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY, 'Content-Type': file.type }, body: file });
        if (res.ok) return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${fileName}`;
        return null;
    } catch (err) { return null; }
}
async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const scale = Math.min(1000 / img.width, 1);
                canvas.width = img.width * scale; canvas.height = img.height * scale;
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(resolve, "image/jpeg", 0.7);
            };
        };
    });
}
document.getElementById("imageInput").addEventListener("change", async (e) => {
    if (!e.target.files[0] || !activeBubbleId) return;
    const blob = await compressImage(e.target.files[0]);
    const url = await uploadToSupabase(new File([blob], "photo.jpg", {type: "image/jpeg"}));
    if (url) {
        const b = nodesData.get(activeBubbleId);
        if (!b.content.photos) b.content.photos = [];
        b.content.photos.push({ id: Date.now(), url });
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    }
});

// 8. Audio Groups Logic
let mediaRecorder, audioChunks = [];
window.addAudioGroup = async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.audioGroups) b.content.audioGroups = [];
    b.content.audioGroups.push({ id: Date.now(), title: "Neue Gruppe", description: "", isOpen: true, audios: [] });
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};
window.toggleAudioGroup = async (gIdx, isOpen) => {
    const b = nodesData.get(activeBubbleId);
    b.content.audioGroups[gIdx].isOpen = isOpen;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};
window.updateAudioGroupField = async (gIdx, field, value) => {
    const b = nodesData.get(activeBubbleId);
    b.content.audioGroups[gIdx][field] = value;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};
window.askDeleteAudioGroup = (gIdx) => {
    currentAction = { action: 'deleteAudioGroup', gIdx };
    document.getElementById("confirmModal").classList.add("active");
};
window.startGroupRecording = async (gIdx) => {
    const btn = document.getElementById(`recBtn_${gIdx}`);
    if (mediaRecorder && mediaRecorder.state === "recording" && activeGroupRecordingIndex === gIdx) {
        mediaRecorder.stop();
        if (btn) btn.innerHTML = "🎙️ Neue Aufnahme starten";
        activeGroupRecordingIndex = null;
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            activeGroupRecordingIndex = gIdx;
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.start();
            if (btn) btn.innerHTML = "⏹️ Aufnahme läuft... Zum Stoppen klicken";
            mediaRecorder.onstop = async () => {
                const file = new File([new Blob(audioChunks, { type: "audio/webm" })], "record.webm", {type: "audio/webm"});
                audioChunks = [];
                const url = await uploadToSupabase(file);
                if(url){
                    const b = nodesData.get(activeBubbleId);
                    if (!b.content.audioGroups[gIdx].audios) b.content.audioGroups[gIdx].audios = [];
                    b.content.audioGroups[gIdx].audios.push({ id: Date.now(), title: "Sprachaufnahme", url });
                    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
                }
            };
        } catch (err) { alert("Bitte erlauben Sie den Zugriff auf das Mikrofon."); }
    }
};
window.updateGroupAudioTitle = async (gIdx, aIdx, title) => {
    const b = nodesData.get(activeBubbleId);
    b.content.audioGroups[gIdx].audios[aIdx].title = title;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};
window.askDeleteGroupAudio = (gIdx, aIdx) => {
    currentAction = { action: 'deleteGroupAudio', gIdx, aIdx };
    document.getElementById("confirmModal").classList.add("active");
};

// 9. Tab Management & Content Rendering (مُحدث ليعمل مع الحقن الديناميكي)
document.querySelector(".modal-card").addEventListener("click", (e) => {
    const tabBtn = e.target.closest('.tab-btn');
    if (tabBtn) {
        document.querySelectorAll(".tab-btn, .tab-content").forEach(el => el.classList.remove("active"));
        tabBtn.classList.add("active");
        document.getElementById(tabBtn.dataset.tab).classList.add("active");
        
        // إصلاح رسم الخريطة الداخلية إذا تم فتح تبويبها
        if(tabBtn.dataset.tab === "internalMapTab" && internalNetwork) {
            internalNetwork.redraw();
            internalNetwork.fit();
        }
    }
});

document.getElementById("closeContentModal").addEventListener("click", () => document.getElementById("contentModal").classList.remove("active"));
document.getElementById("bubbleTitleInput").addEventListener("change", (e) => {
    if (activeBubbleId) updateDoc(doc(db, "bubbles", activeBubbleId), { title: e.target.value });
});

function renderContent(id) {
    const bubble = nodesData.get(id);
    if (!bubble) return;
    
    let content = bubble.content || { quickNotes: [], notebooks: [], audioGroups: [], photos: [], internalNodes: [], internalEdges: [] };

    // Notes, Notebooks, Audio, Photos rendering...
    document.getElementById("quickNotesList").innerHTML = (content.quickNotes || []).map((n, i) => `
        <div class="item-card">
            <input type="text" value="${n.title}" onchange="updateData('quickNotes', ${i}, 'title', this.value)">
            <textarea onchange="updateData('quickNotes', ${i}, 'text', this.value)">${n.text}</textarea>
            <div class="item-actions">
                <button class="btn-icon-text" onclick="openMoveModal('quickNotes', ${i})">Verschieben</button>
                <button class="btn-icon-text" style="color:var(--danger-color)" onclick="askDelete('quickNotes', ${i})">Löschen</button>
            </div>
        </div>`).join("");

    document.getElementById("notebooksList").innerHTML = (content.notebooks || []).map((nb, i) => `
        <div class="notebook-cover">
            <input type="text" class="notebook-title-input" value="${nb.title}" onchange="updateData('notebooks', ${i}, 'title', this.value)">
            <div class="notebook-actions">
                <button class="btn-open" onclick="openNotebook(${i})">Öffnen</button>
                <div class="actions-row">
                    <button class="btn-icon-text" onclick="openMoveModal('notebooks', ${i})">Verschieben</button>
                    <button class="btn-icon-text" style="color:var(--danger-color)" onclick="askDelete('notebooks', ${i})">Löschen</button>
                </div>
            </div>
        </div>`).join("");
        
    document.getElementById("audiosList").innerHTML = `
        <div style="margin-bottom: 15px;"><button class="btn-primary" onclick="addAudioGroup()" style="width: 100%; padding: 12px; cursor: pointer;">+ Neue Audiogruppe</button></div>
        <div id="audioGroupsContainer">
            ${(content.audioGroups || []).map((group, gIdx) => `
                <div style="border: 2px solid #E4ECE7; padding: 16px; border-radius: 12px; margin-bottom: 16px; background: #FFFFFF;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 10px;">
                        <input type="text" value="${group.title || ''}" onchange="updateAudioGroupField(${gIdx}, 'title', this.value)" style="width: 100%; font-weight: bold; padding: 8px; border-radius: 6px; border: 1px solid #D1DED6;">
                        <div style="display: flex; gap: 6px;">
                            ${group.isOpen ? `<button onclick="toggleAudioGroup(${gIdx}, false)" style="background: #E4ECE7; border: none; padding: 8px; border-radius: 6px; cursor: pointer;">🙈</button>` : `<button onclick="toggleAudioGroup(${gIdx}, true)" style="background: #D9EBE4; border: none; padding: 8px; border-radius: 6px; cursor: pointer;">👁️</button>`}
                            <button onclick="askDeleteAudioGroup(${gIdx})" style="background: #FFE8E8; color: #D9534F; border: none; padding: 8px; border-radius: 6px; cursor: pointer;">🗑️</button>
                        </div>
                    </div>
                    ${group.isOpen ? `
                        <div style="margin-top: 10px; border-top: 2px dashed #E4ECE7; padding-top: 10px;">
                            <div style="text-align: center; margin-bottom: 10px;"><button onclick="startGroupRecording(${gIdx})" id="recBtn_${gIdx}" style="background: #4A5D54; color: white; border: none; padding: 8px 15px; border-radius: 20px; cursor: pointer;">🎙️ Aufnahme starten</button></div>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                ${(group.audios && group.audios.length > 0) ? group.audios.map((a, aIdx) => `
                                    <div style="background: #FFF; padding: 10px; border-radius: 8px; border: 1px solid #E0E7E3;">
                                        <input type="text" value="${a.title}" onchange="updateGroupAudioTitle(${gIdx}, ${aIdx}, this.value)" style="border: none; border-bottom: 1px solid #CCC; width: 100%; margin-bottom: 5px;">
                                        <audio controls src="${a.url}" style="width: 100%; height: 30px;"></audio>
                                        <button style="color: #D9534F; background: none; border: none; font-size: 11px; cursor: pointer;" onclick="askDeleteGroupAudio(${gIdx}, ${aIdx})">Löschen 🗑️</button>
                                    </div>
                                `).join("") : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `).join("")}
        </div>
    `;

    document.getElementById("photosList").innerHTML = (content.photos || []).map((p, i) => `
        <div class="photo-wrapper"><img src="${p.url}"><button class="delete-btn" style="position:absolute; top:8px; right:8px;" onclick="askDelete('photos', ${i})">&times;</button></div>
    `).join("");

    // --- تهيئة الخريطة الذهنية الداخلية ---
    initInternalMindmap(bubble, content);
}

window.updateData = async (type, index, field, value) => {
    const b = nodesData.get(activeBubbleId);
    b.content[type][index][field] = value;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

document.getElementById("addQuickNoteBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.quickNotes) b.content.quickNotes = [];
    b.content.quickNotes.push({ title: "Neue Notiz", text: "" });
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
});

document.getElementById("addNotebookBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.notebooks) b.content.notebooks = [];
    b.content.notebooks.push({ title: "Neues Notizbuch", pages: [""] });
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
});

// ==========================================
// منطق الخريطة الذهنية الداخلية
// ==========================================
function initInternalMindmap(bubble, content) {
    internalNodes.clear();
    internalEdges.clear();
    selectedInternalNodeId = null;
    document.getElementById("deleteInternalNodeBtn").style.display = "none";

    // وضع الدائرة الرئيسية (الأم) في المنتصف بشكل ثابت
    internalNodes.add({
        id: 'center_node',
        label: bubble.label,
        color: { background: "#2C3E35", border: "#1F2D26" },
        font: { color: "white" },
        fixed: true,
        x: 0, y: 0,
        size: 25
    });

    if (content.internalNodes) internalNodes.add(content.internalNodes);
    if (content.internalEdges) internalEdges.add(content.internalEdges);

    const intContainer = document.getElementById("internalMindmapContainer");
    const intData = { nodes: internalNodes, edges: internalEdges };
    const intOptions = {
        nodes: { shape: "dot", size: 18, color: { background: "#F2F7F4", border: "#C2DACF" } },
        edges: { smooth: { type: "continuous" }, color: "#C2DACF" },
        physics: { enabled: true, solver: "repulsion", repulsion: { nodeDistance: 120 } },
        manipulation: {
            enabled: false,
            addEdge: async function(edgeData, callback) {
                if (edgeData.from !== edgeData.to) {
                    callback(edgeData);
                    saveInternalMindmap();
                }
            }
        }
    };

    if (!internalNetwork) {
        internalNetwork = new vis.Network(intContainer, intData, intOptions);
        
        internalNetwork.on("selectNode", function(params) {
            if (params.nodes[0] !== 'center_node') {
                selectedInternalNodeId = params.nodes[0];
                document.getElementById("deleteInternalNodeBtn").style.display = "block";
            } else {
                document.getElementById("deleteInternalNodeBtn").style.display = "none";
            }
        });

        internalNetwork.on("deselectNode", function() {
            selectedInternalNodeId = null;
            document.getElementById("deleteInternalNodeBtn").style.display = "none";
        });

        internalNetwork.on("doubleClick", function(params) {
            if (params.nodes.length > 0 && params.nodes[0] !== 'center_node') {
                let newLabel = prompt("Neuer Name (الاسم الجديد):", internalNodes.get(params.nodes[0]).label);
                if (newLabel) {
                    internalNodes.update({ id: params.nodes[0], label: newLabel });
                    saveInternalMindmap();
                }
            }
        });

        internalNetwork.on("dragEnd", saveInternalMindmap);
    } else {
        internalNetwork.setData(intData);
    }
}

async function saveInternalMindmap() {
    if (!activeBubbleId) return;
    const b = nodesData.get(activeBubbleId);
    
    // حفظ العقد والروابط (مع استثناء الدائرة المركزية لأنها ثابتة)
    const iNodesToSave = internalNodes.get().filter(n => n.id !== 'center_node').map(n => ({id: n.id, label: n.label, x: n.x, y: n.y}));
    const iEdgesToSave = internalEdges.get().map(e => ({id: e.id, from: e.from, to: e.to}));

    b.content.internalNodes = iNodesToSave;
    b.content.internalEdges = iEdgesToSave;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
}

// أزرار التحكم بالخريطة الداخلية
document.getElementById("addInternalNodeBtn").addEventListener("click", () => {
    const newNodeId = Date.now().toString();
    internalNodes.add({ id: newNodeId, label: "Neuer Gedanke" });
    saveInternalMindmap();
});

document.getElementById("internalConnectSwitch").addEventListener("change", (e) => {
    if (e.target.checked) internalNetwork.addEdgeMode();
    else internalNetwork.disableEditMode();
});

document.getElementById("deleteInternalNodeBtn").addEventListener("click", () => {
    if (selectedInternalNodeId && selectedInternalNodeId !== 'center_node') {
        internalNodes.remove(selectedInternalNodeId);
        // إزالة الروابط المرتبطة بالعقدة المحذوفة
        const edgesToRemove = internalEdges.get().filter(e => e.from === selectedInternalNodeId || e.to === selectedInternalNodeId);
        edgesToRemove.forEach(e => internalEdges.remove(e.id));
        
        saveInternalMindmap();
        document.getElementById("deleteInternalNodeBtn").style.display = "none";
        selectedInternalNodeId = null;
    }
});


// 10. Notebook Logic
window.openNotebook = (index) => {
    currentNotebookIndex = index; currentPageIndex = 0;
    const b = nodesData.get(activeBubbleId);
    const nb = b.content.notebooks[index];
    if (!nb.pages) { nb.pages = [nb.text || ""]; delete nb.text; }
    document.getElementById("activeNotebookTitle").innerText = nb.title;
    document.getElementById("notebookModal").classList.add("active");
    renderNotebookPage();
};

function renderNotebookPage() {
    const nb = nodesData.get(activeBubbleId).content.notebooks[currentNotebookIndex];
    const textContent = nb.pages[currentPageIndex] || "";
    document.getElementById("notebookPageInput").value = textContent;
    document.getElementById("pageIndicator").innerText = `Seite ${currentPageIndex + 1}`;
    document.getElementById("prevPageBtn").disabled = currentPageIndex === 0;
    document.getElementById("nextPageBtn").disabled = textContent.trim() === "";
}

document.getElementById("notebookPageInput").addEventListener("input", async (e) => {
    const text = e.target.value;
    const b = nodesData.get(activeBubbleId);
    b.content.notebooks[currentNotebookIndex].pages[currentPageIndex] = text;
    document.getElementById("nextPageBtn").disabled = text.trim() === "";
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
});

document.getElementById("prevPageBtn").addEventListener("click", () => {
    if (currentPageIndex > 0) { currentPageIndex--; renderNotebookPage(); }
});
document.getElementById("nextPageBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    const nb = b.content.notebooks[currentNotebookIndex];
    if (nb.pages[currentPageIndex].trim() !== "") {
        currentPageIndex++;
        if (currentPageIndex >= nb.pages.length) {
            nb.pages.push("");
            await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
        }
        renderNotebookPage();
    }
});
document.getElementById("closeNotebookModal").addEventListener("click", () => document.getElementById("notebookModal").classList.remove("active"));

// 11. Centralized Delete & Move Logic
window.askDelete = (type, index) => {
    currentAction = { action: 'deleteItem', type, index };
    document.getElementById("confirmModal").classList.add("active");
};
document.getElementById("deleteBubbleBtn").addEventListener("click", () => {
    currentAction = { action: 'deleteBubble' }; 
    document.getElementById("confirmModal").classList.add("active");
});
document.getElementById("cancelConfirmBtn").addEventListener("click", () => document.getElementById("confirmModal").classList.remove("active"));

document.getElementById("actionConfirmBtn").addEventListener("click", async () => {
    if (!currentAction) return;

    if (currentAction.action === 'deleteBubble') {
        await deleteDoc(doc(db, "bubbles", activeBubbleId));
        document.getElementById("contentModal").classList.remove("active");
    } else if (currentAction.action === 'deleteAudioGroup') {
        const b = nodesData.get(activeBubbleId);
        b.content.audioGroups.splice(currentAction.gIdx, 1);
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    } else if (currentAction.action === 'deleteGroupAudio') {
        const b = nodesData.get(activeBubbleId);
        b.content.audioGroups[currentAction.gIdx].audios.splice(currentAction.aIdx, 1);
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    } else if (currentAction.action === 'deleteItem') {
        const b = nodesData.get(activeBubbleId);
        b.content[currentAction.type].splice(currentAction.index, 1);
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    }
    
    currentAction = null;
    document.getElementById("confirmModal").classList.remove("active");
});

window.openMoveModal = (type, index) => {
    currentAction = { action: 'move', type, index };
    document.getElementById("targetBubbleSelect").innerHTML = nodesData.get().filter(n => n.id !== activeBubbleId).map(n => `<option value="${n.id}">${n.label}</option>`).join("");
    document.getElementById("moveModal").classList.add("active");
};
document.getElementById("cancelMoveBtn").addEventListener("click", () => document.getElementById("moveModal").classList.remove("active"));
document.getElementById("actionMoveBtn").addEventListener("click", async () => {
    const targetId = document.getElementById("targetBubbleSelect").value;
    if(!targetId) return;
    const sourceB = nodesData.get(activeBubbleId);
    const targetB = nodesData.get(targetId);
    const item = sourceB.content[currentAction.type].splice(currentAction.index, 1)[0];
    if (!targetB.content[currentAction.type]) targetB.content[currentAction.type] = [];
    targetB.content[currentAction.type].push(item);
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: sourceB.content });
    await updateDoc(doc(db, "bubbles", targetId), { content: targetB.content });
    document.getElementById("moveModal").classList.remove("active");
});
