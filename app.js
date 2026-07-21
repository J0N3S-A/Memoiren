import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// إعدادات Firebase
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

// إعدادات Supabase
const SUPABASE_URL = "https://slcjqnexveclbtvjxeuc.supabase.co";
const SUPABASE_KEY = "sb_publishable_RaoTVkCg8uqZPrQM2kxPPQ_toTZh..."; 
const BUCKET_NAME = "memoiren-files";

let nodesData = new vis.DataSet([]);
let edgesData = new vis.DataSet([]);
let activeBubbleId = null;
let currentAction = null;

// شبكة الخريطة الذهنية الألمانية بألوان هادئة وأشكال دائرية متناسقة
const container = document.getElementById("mindmap");
const data = { nodes: nodesData, edges: edgesData };
const options = {
    nodes: {
        shape: "dot",
        size: 24,
        color: { background: "#EAEFEA", border: "#D2DDD7", highlight: { background: "#CBE6DF", border: "#A8C3B8" } },
        font: { family: "Plus Jakarta Sans", color: "#2C3E35", size: 14, face: "Plus Jakarta Sans" },
        borderWidth: 2, shadow: { enabled: true, color: "rgba(0,0,0,0.03)", size: 10 }
    },
    edges: { color: { color: "#A8C3B8", highlight: "#8EAFA2" }, smooth: { type: "continuous" }, width: 2 },
    physics: { solver: "repulsion", repulsion: { nodeDistance: 140 } },
    interaction: { hover: true },
    manipulation: { enabled: false, addEdge: async function(edgeData, callback) {
        if(edgeData.from !== edgeData.to) {
            await addDoc(collection(db, "connections"), { from: edgeData.from, to: edgeData.to });
            callback(edgeData);
        }
    }}
};
const network = new vis.Network(container, data, options);

// المزامن اللحظي
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
        content: { quickNotes: [], notebooks: [], audios: [], photos: [] }
    });
});

async function uploadToSupabase(file) {
    const fileName = `${Date.now()}_${file.name}`;
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${fileName}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY, 'Content-Type': file.type },
        body: file
    });
    if (res.ok) return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${fileName}`;
    return null;
}

// ضغط الصور
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
        b.content.photos.push({ id: Date.now(), url });
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    }
});

// تسجيل الصوت
let mediaRecorder, audioChunks = [];
document.getElementById("recordAudioBtn").addEventListener("click", async () => {
    const btn = document.getElementById("recordAudioBtn");
    const timer = document.getElementById("recordingTimer");
    
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        btn.innerText = "Aufnahme starten";
        timer.style.display = "none";
    } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.start();
        btn.innerText = "Stoppen & Speichern";
        timer.style.display = "inline";
        
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const file = new File([new Blob(audioChunks, { type: "audio/webm" })], "record.webm", {type: "audio/webm"});
            audioChunks = [];
            const url = await uploadToSupabase(file);
            if(url){
                const b = nodesData.get(activeBubbleId);
                b.content.audios.push({ id: Date.now(), title: "Audioaufnahme", url });
                await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
            }
        };
    }
});

// التبويبات
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        document.querySelectorAll(".tab-btn, .tab-content").forEach(el => el.classList.remove("active"));
        e.currentTarget.classList.add("active");
        document.getElementById(e.currentTarget.dataset.tab).classList.add("active");
    });
});

document.getElementById("closeContentModal").addEventListener("click", () => document.getElementById("contentModal").classList.remove("active"));
document.getElementById("bubbleTitleInput").addEventListener("change", (e) => {
    if (activeBubbleId) updateDoc(doc(db, "bubbles", activeBubbleId), { title: e.target.value });
});

function renderContent(id) {
    const content = nodesData.get(id).content;
    
    document.getElementById("quickNotesList").innerHTML = content.quickNotes.map((n, i) => `
        <div class="item-card">
            <input type="text" value="${n.title}" onchange="updateData('quickNotes', ${i}, 'title', this.value)">
            <textarea onchange="updateData('quickNotes', ${i}, 'text', this.value)">${n.text}</textarea>
            <div class="item-actions">
                <button class="btn-icon-text" onclick="openMoveModal('quickNotes', ${i})">Verschieben</button>
                <button class="btn-icon-text" style="color:var(--danger-color)" onclick="askDelete('quickNotes', ${i})">Löschen</button>
            </div>
        </div>`).join("");

    document.getElementById("notebooksList").innerHTML = content.notebooks.map((nb, i) => `
        <div class="item-card">
            <input type="text" value="${nb.title}" onchange="updateData('notebooks', ${i}, 'title', this.value)">
            <textarea placeholder="Hauptseiteninhalt..." onchange="updateData('notebooks', ${i}, 'text', this.value)">${nb.text || ''}</textarea>
            <div class="item-actions">
                <button class="btn-icon-text" onclick="openMoveModal('notebooks', ${i})">Verschieben</button>
                <button class="btn-icon-text" style="color:var(--danger-color)" onclick="askDelete('notebooks', ${i})">Löschen</button>
            </div>
        </div>`).join("");
        
    document.getElementById("audiosList").innerHTML = content.audios.map((a, i) => `
        <div class="item-card">
            <input type="text" value="${a.title}" onchange="updateData('audios', ${i}, 'title', this.value)">
            <audio controls src="${a.url}" style="width:100%; margin-top:5px;"></audio>
            <div class="item-actions">
                <button class="btn-icon-text" style="color:var(--danger-color)" onclick="askDelete('audios', ${i})">Löschen</button>
            </div>
        </div>`).join("");

    document.getElementById("photosList").innerHTML = content.photos.map((p, i) => `
        <div class="photo-wrapper">
            <img src="${p.url}">
            <button class="delete-btn" style="position:absolute; top:4px; right:4px; background:white; padding:2px 6px; border-radius:50%" onclick="askDelete('photos', ${i})">&times;</button>
        </div>`).join("");
}

window.updateData = async (type, index, field, value) => {
    const b = nodesData.get(activeBubbleId);
    b.content[type][index][field] = value;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

document.getElementById("addQuickNoteBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    b.content.quickNotes.push({ title: "Titel der Notiz", text: "Hier schreiben..." });
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
});

document.getElementById("addNotebookBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    b.content.notebooks.push({ title: "Neues Notizbuch", text: "" });
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
});

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
    if(currentAction.action === 'deleteBubble') {
        await deleteDoc(doc(db, "bubbles", activeBubbleId));
        document.getElementById("contentModal").classList.remove("active");
    } else {
        const b = nodesData.get(activeBubbleId);
        b.content[currentAction.type].splice(currentAction.index, 1);
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    }
    document.getElementById("confirmModal").classList.remove("active");
});

window.openMoveModal = (type, index) => {
    currentAction = { action: 'move', type, index };
    const select = document.getElementById("targetBubbleSelect");
    select.innerHTML = nodesData.get().filter(n => n.id !== activeBubbleId).map(n => `<option value="${n.id}">${n.label}</option>`).join("");
    document.getElementById("moveModal").classList.add("active");
};
document.getElementById("cancelMoveBtn").addEventListener("click", () => document.getElementById("moveModal").classList.remove("active"));
document.getElementById("actionMoveBtn").addEventListener("click", async () => {
    const targetId = document.getElementById("targetBubbleSelect").value;
    if(!targetId) return;
    
    const sourceB = nodesData.get(activeBubbleId);
    const targetB = nodesData.get(targetId);
    const item = sourceB.content[currentAction.type].splice(currentAction.index, 1)[0];
    targetB.content[currentAction.type].push(item);
    
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: sourceB.content });
    await updateDoc(doc(db, "bubbles", targetId), { content: targetB.content });
    
    document.getElementById("moveModal").classList.remove("active");
});
