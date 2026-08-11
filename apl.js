import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

const SUPABASE_URL = "https://slcjqnexveclbtvjxeuc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsY2pxbmV4dmVjbGJ0dmp4ZXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MTcwNTksImV4cCI6MjEwMDE5MzA1OX0.tZM3I7Kx8_ACL4_HzZRvqSr31OmfuueJs9_Ml7ldgHA"; 
const BUCKET_NAME = "memoiren-files";

let nodesData = new vis.DataSet([]);
let edgesData = new vis.DataSet([]);
let activeBubbleId = null;
let currentAction = null;
let currentNotebookIndex = null;
let currentPageIndex = 0;
let activeGroupRecordingIndex = null;
let mainMediaRecorder = null, mainAudioChunks = [];

const container = document.getElementById("mindmap");
const data = { nodes: nodesData, edges: edgesData };
const options = {
    nodes: {
        shape: "dot", size: 22,
        color: { background: "#F2F7F4", border: "#E4ECE7", highlight: { background: "#D9EBE4", border: "#C2DACF" } },
        font: { family: "Plus Jakarta Sans", color: "#4A5D54", size: 14 },
        borderWidth: 2, shadow: { enabled: true, color: "rgba(74, 93, 84, 0.04)", size: 12 }
    },
    edges: { color: { color: "#C2DACF", highlight: "#A7CBB9" }, smooth: { type: "continuous" }, width: 2 },
    physics: { enabled: false },
    interaction: { hover: true, dragNodes: true },
    manipulation: { enabled: false, addEdge: async function(edgeData, callback) {
        if(edgeData.from !== edgeData.to) {
            try {
                await addDoc(collection(db, "connections"), { from: edgeData.from, to: edgeData.to });
                callback(edgeData);
            } catch(e) { console.error("Error adding connection:", e); }
        }
    }}
};
const network = new vis.Network(container, data, options);

network.on("dragEnd", async function (params) {
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const position = network.getPosition(nodeId);
        try {
            await updateDoc(doc(db, "bubbles", nodeId), { x: position.x, y: position.y });
        } catch(e) { console.error("Error saving position:", e); }
    }
});

onSnapshot(collection(db, "bubbles"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        const d = change.doc.data();
        if (change.type === "added" || change.type === "modified") {
            nodesData.update({ id: change.doc.id, label: d.title, x: d.x, y: d.y, content: d.content });
            if(activeBubbleId === change.doc.id) renderContent(activeBubbleId);
        }
        if (change.type === "removed") nodesData.remove(change.doc.id);
    });
}, err => alert("فشل الاتصال بـ Firebase: " + err.message));

onSnapshot(collection(db, "connections"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") edgesData.update({ id: change.doc.id, from: change.doc.data().from, to: change.doc.data().to });
        if (change.type === "removed") edgesData.remove(change.doc.id);
    });
});

// إنشاء كرة جديدة لدعم اللمس والماوس والضغط Direct Click
const basket = document.getElementById("bubbleBasket");
async function createNewBubble(x, y) {
    try {
        const rect = container.getBoundingClientRect();
        const pos = network.DOMtoCanvas({ x: x - rect.left, y: y - rect.top });
        await addDoc(collection(db, "bubbles"), {
            title: "Neuer Gedanke", x: pos.x || 0, y: pos.y || 0,
            content: { quickNotes: [], notebooks: [], audioGroups: [], photos: [] }
        });
    } catch(err) { alert("خطأ في إنشاء الكرة: " + err.message); }
}

basket.addEventListener("dragend", (e) => createNewBubble(e.clientX, e.clientY));
basket.addEventListener("touchend", (e) => {
    if(e.changedTouches && e.changedTouches[0]) {
        createNewBubble(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
});
basket.addEventListener("click", () => {
    const center = network.getViewPosition();
    addDoc(collection(db, "bubbles"), {
        title: "Neuer Gedanke", x: center.x, y: center.y,
        content: { quickNotes: [], notebooks: [], audioGroups: [], photos: [] }
    }).catch(e => alert("خطأ: " + e.message));
});

document.getElementById("connectSwitch").addEventListener("change", (e) => {
    if (e.target.checked) network.addEdgeMode();
    else network.disableEditMode();
});

network.on("doubleClick", (params) => {
    if (params.nodes.length > 0) {
        activeBubbleId = params.nodes[0];
        const bubble = nodesData.get(activeBubbleId);
        document.getElementById("bubbleTitleInput").value = bubble.label || "";
        document.getElementById("contentModal").classList.add("active");
        renderContent(activeBubbleId);
    }
});

// فتح الخريطة الفرعية
document.getElementById("openSubmapBtn").addEventListener("click", () => {
    if(activeBubbleId) {
        window.location.href = `submap.html?parentId=${activeBubbleId}`;
    }
});

// رفع الملفات لـ Supabase
async function uploadToSupabase(file) {
    try {
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${fileName}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY, 'Content-Type': file.type },
            body: file
        });
        if (res.ok) return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${fileName}`;
        else { console.error("Supabase Error:", await res.json()); return null; }
    } catch (err) { alert("خطأ رفع الملف: " + err.message); return null; }
}

document.getElementById("imageInput").addEventListener("change", async (e) => {
    if (!e.target.files[0] || !activeBubbleId) return;
    const url = await uploadToSupabase(e.target.files[0]);
    if (url) {
        const b = nodesData.get(activeBubbleId);
        if (!b.content.photos) b.content.photos = [];
        b.content.photos.push({ id: Date.now(), url });
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    }
});

// التسجيل الصوتي المباشر
document.getElementById("recordAudioBtn").addEventListener("click", async () => {
    const btn = document.getElementById("recordAudioBtn");
    if (mainMediaRecorder && mainMediaRecorder.state === "recording") {
        mainMediaRecorder.stop();
        btn.innerText = "🎙️ Aufnahme starten";
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mainMediaRecorder = new MediaRecorder(stream);
            mainAudioChunks = [];
            mainMediaRecorder.ondataavailable = e => { if (e.data.size > 0) mainAudioChunks.push(e.data); };
            mainMediaRecorder.start();
            btn.innerText = "⏹️ Aufnahme läuft... Zum Stoppen klicken";
            mainMediaRecorder.onstop = async () => {
                const file = new File([new Blob(mainAudioChunks, { type: "audio/webm" })], "record.webm", {type: "audio/webm"});
                const url = await uploadToSupabase(file);
                if (url) {
                    const b = nodesData.get(activeBubbleId);
                    if (!b.content.audioGroups) b.content.audioGroups = [];
                    if (b.content.audioGroups.length === 0) {
                        b.content.audioGroups.push({ id: Date.now(), title: "Hauptaufnahmen", description: "", isOpen: true, audios: [] });
                    }
                    b.content.audioGroups[0].audios.push({ id: Date.now(), title: "Sprachaufnahme", url });
                    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
                }
            };
        } catch (err) { alert("الرجاء السماح بالوصول للميكروفون: " + err.message); }
    }
});

// الحفظ الفوري وقفل النافذة
document.getElementById("bubbleTitleInput").addEventListener("input", async (e) => {
    if (activeBubbleId) {
        try {
            await updateDoc(doc(db, "bubbles", activeBubbleId), { title: e.target.value });
        } catch(err) { console.error(err); }
    }
});

document.getElementById("closeContentModal").addEventListener("click", async () => {
    if (activeBubbleId) {
        const val = document.getElementById("bubbleTitleInput").value;
        await updateDoc(doc(db, "bubbles", activeBubbleId), { title: val }).catch(e => console.error(e));
    }
    document.getElementById("contentModal").classList.remove("active");
});

document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        document.querySelectorAll(".tab-btn, .tab-content").forEach(el => el.classList.remove("active"));
        e.currentTarget.classList.add("active");
        document.getElementById(e.currentTarget.dataset.tab).classList.add("active");
    });
});

function renderContent(id) {
    const bubble = nodesData.get(id);
    if (!bubble) return;
    let content = bubble.content || { quickNotes: [], notebooks: [], audioGroups: [], photos: [] };

    document.getElementById("quickNotesList").innerHTML = (content.quickNotes || []).map((n, i) => `
        <div class="item-card">
            <input type="text" value="${n.title || ''}" oninput="updateData('quickNotes', ${i}, 'title', this.value)">
            <textarea oninput="updateData('quickNotes', ${i}, 'text', this.value)">${n.text || ''}</textarea>
            <div class="item-actions">
                <button class="btn-icon-text" onclick="openMoveModal('quickNotes', ${i})">Verschieben</button>
                <button class="btn-icon-text" style="color:var(--danger-color)" onclick="askDelete('quickNotes', ${i})">Löschen</button>
            </div>
        </div>`).join("");

    document.getElementById("notebooksList").innerHTML = (content.notebooks || []).map((nb, i) => `
        <div class="notebook-cover">
            <input type="text" class="notebook-title-input" value="${nb.title || ''}" oninput="updateData('notebooks', ${i}, 'title', this.value)">
            <button class="btn-open" onclick="openNotebook(${i})">Öffnen</button>
            <button class="btn-icon-text" style="color:var(--danger-color); margin-top:8px;" onclick="askDelete('notebooks', ${i})">Löschen</button>
        </div>`).join("");

    document.getElementById("photosList").innerHTML = (content.photos || []).map((p, i) => `
        <div class="photo-wrapper">
            <img src="${p.url}">
            <button class="delete-btn" style="position:absolute; top:4px; right:4px;" onclick="askDelete('photos', ${i})">&times;</button>
        </div>`).join("");
}

window.updateData = async (type, index, field, value) => {
    const b = nodesData.get(activeBubbleId);
    b.content[type][index][field] = value;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content }).catch(e => console.error(e));
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

window.openNotebook = (index) => {
    currentNotebookIndex = index; currentPageIndex = 0;
    const b = nodesData.get(activeBubbleId);
    const nb = b.content.notebooks[index];
    document.getElementById("activeNotebookTitle").innerText = nb.title || "Notizbuch";
    document.getElementById("notebookModal").classList.add("active");
    renderNotebookPage();
};

function renderNotebookPage() {
    const nb = nodesData.get(activeBubbleId).content.notebooks[currentNotebookIndex];
    document.getElementById("notebookPageInput").value = nb.pages[currentPageIndex] || "";
    document.getElementById("pageIndicator").innerText = `Seite ${currentPageIndex + 1}`;
}

document.getElementById("notebookPageInput").addEventListener("input", async (e) => {
    const b = nodesData.get(activeBubbleId);
    b.content.notebooks[currentNotebookIndex].pages[currentPageIndex] = e.target.value;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content }).catch(e => console.error(e));
});

document.getElementById("closeNotebookModal").addEventListener("click", () => document.getElementById("notebookModal").classList.remove("active"));

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
    } else if (currentAction.action === 'deleteItem') {
        const b = nodesData.get(activeBubbleId);
        b.content[currentAction.type].splice(currentAction.index, 1);
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    }
    currentAction = null;
    document.getElementById("confirmModal").classList.remove("active");
});
