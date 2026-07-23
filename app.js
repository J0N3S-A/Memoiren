import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 1. إعدادات Firebase
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

// 2. إعدادات Supabase
const SUPABASE_URL = "https://slcjqnexveclbtvjxeuc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsY2pxbmV4dmVjbGJ0dmp4ZXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MTcwNTksImV4cCI6MjEwMDE5MzA1OX0.tZM3I7Kx8_ACL4_HzZRvqSr31OmfuueJs9_Ml7ldgHA"; 
const BUCKET_NAME = "memoiren-files";

// 3. المتغيرات العامة
let nodesData = new vis.DataSet([]);
let edgesData = new vis.DataSet([]);
let activeBubbleId = null;
let currentAction = null;
let currentNotebookIndex = null;
let currentPageIndex = 0;
let activeGroupRecordingIndex = null;

// 4. إعداد الخريطة الذهنية مع التثبيت عند الدخول لمنع القفز العشوائي
const container = document.getElementById("mindmap");
const data = { nodes: nodesData, edges: edgesData };
const options = {
    nodes: {
        shape: "dot", size: 22,
        color: { 
            background: "#F2F7F4", border: "#E4ECE7", 
            highlight: { background: "#D9EBE4", border: "#C2DACF" } 
        },
        font: { family: "Plus Jakarta Sans", color: "#4A5D54", size: 14, face: "Plus Jakarta Sans" },
        borderWidth: 2, shadow: { enabled: true, color: "rgba(74, 93, 84, 0.04)", size: 12 }
    },
    edges: { color: { color: "#C2DACF", highlight: "#A7CBB9" }, smooth: { type: "continuous" }, width: 2 },
    physics: { 
        solver: "repulsion", 
        repulsion: { nodeDistance: 150 },
        stabilization: { enabled: true, iterations: 1000, updateInterval: 50, fit: true }
    },
    interaction: { hover: true },
    manipulation: { enabled: false, addEdge: async function(edgeData, callback) {
        if(edgeData.from !== edgeData.to) {
            await addDoc(collection(db, "connections"), { from: edgeData.from, to: edgeData.to });
            callback(edgeData);
        }
    }}
};
const network = new vis.Network(container, data, options);

// تثبيت الكرات فور انتهاء الاستقرار الأول لمنع أي حركة مزعجة عند فتح الموقع
network.once("stabilizationIterationsDone", function () {
    network.setOptions({ physics: false });
});

// 5. المزامنة مع Firebase
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

// 6. تفاعلات الواجهة الرئيسية
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
        content: { quickNotes: [], notebooks: [], audioGroups: [], photos: [] }
    });
});

// 7. دوال الرفع إلى Supabase
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
    } catch (err) { console.error("Network Error:", err); return null; }
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

// 8. إدارة المجموعات الصوتية والتسجيل
let mediaRecorder, audioChunks = [];

window.addAudioGroup = async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.audioGroups) b.content.audioGroups = [];
    b.content.audioGroups.push({ id: Date.now(), title: "مجموعة جديدة", description: "شرح المجموعة هنا...", isOpen: false, audios: [] });
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

window.deleteAudioGroup = async (gIdx) => {
    const b = nodesData.get(activeBubbleId);
    b.content.audioGroups.splice(gIdx, 1);
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

window.startGroupRecording = async (gIdx) => {
    const btn = document.getElementById(`recBtn_${gIdx}`);
    if (mediaRecorder && mediaRecorder.state === "recording" && activeGroupRecordingIndex === gIdx) {
        mediaRecorder.stop();
        btn.innerText = "تسجيل صوتي جديد";
        activeGroupRecordingIndex = null;
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            activeGroupRecordingIndex = gIdx;
            
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.start();
            btn.innerText = "إيقاف الحفظ ⏹️";
            
            mediaRecorder.onstop = async () => {
                const file = new File([new Blob(audioChunks, { type: "audio/webm" })], "record.webm", {type: "audio/webm"});
                audioChunks = [];
                const url = await uploadToSupabase(file);
                if(url){
                    const b = nodesData.get(activeBubbleId);
                    if (!b.content.audioGroups[gIdx].audios) b.content.audioGroups[gIdx].audios = [];
                    b.content.audioGroups[gIdx].audios.push({ id: Date.now(), title: "تسجيل صوتي", url });
                    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
                }
            };
        } catch (err) {
            console.error("Microphone error:", err);
            alert("يرجى السماح للمتصفح بالوصول إلى الميكروفون.");
        }
    }
};

window.updateGroupAudioTitle = async (gIdx, aIdx, title) => {
    const b = nodesData.get(activeBubbleId);
    b.content.audioGroups[gIdx].audios[aIdx].title = title;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

window.deleteGroupAudio = async (gIdx, aIdx) => {
    const b = nodesData.get(activeBubbleId);
    b.content.audioGroups[gIdx].audios.splice(aIdx, 1);
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

// 9. إدارة التبويبات وعرض المحتوى
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
    const bubble = nodesData.get(id);
    const content = bubble.content || { quickNotes: [], notebooks: [], audioGroups: [], photos: [] };
    
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
        
    // عرض مجموعات الأصوات الفرعية بالهيكل المطلوب
    document.getElementById("audiosList").innerHTML = `
        <button class="btn-primary" onclick="addAudioGroup()" style="margin-bottom: 15px; width: 100%;">مجموعة أصوات جديدة +</button>
        <div id="audioGroupsContainer">
            ${(content.audioGroups || []).map((group, gIdx) => `
                <div class="item-card" style="border: 1px solid #E4ECE7; padding: 15px; border-radius: 12px; margin-bottom: 12px; background: #fff;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                        <div style="flex-grow: 1;">
                            <input type="text" value="${group.title}" onchange="updateAudioGroupField(${gIdx}, 'title', this.value)" style="font-weight: bold; border: none; font-size: 16px; width: 100%; background: transparent; color: #4A5D54;" placeholder="عنوان المجموعة">
                            <input type="text" value="${group.description || ''}" onchange="updateAudioGroupField(${gIdx}, 'description', this.value)" style="border: none; font-size: 13px; color: #77887d; width: 100%; background: transparent; margin-top: 4px;" placeholder="شرح المجموعة...">
                        </div>
                        <div style="display: flex; gap: 5px; align-items: center;">
                            ${group.isOpen ? 
                                `<button class="btn-icon-text" onclick="toggleAudioGroup(${gIdx}, false)" style="background: #F2F7F4; padding: 6px 12px; border-radius: 6px; font-weight: 600; color: #4A5D54;">إخفاء</button>` : 
                                `<button class="btn-icon-text" onclick="toggleAudioGroup(${gIdx}, true)" style="background: #E4ECE7; padding: 6px 12px; border-radius: 6px; font-weight: 600; color: #2C3E35;">أظهر الكل</button>`
                            }
                            <button class="btn-icon-text" onclick="deleteAudioGroup(${gIdx})" style="color:var(--danger-color); padding: 6px;" title="حذف المجموعة">🗑️</button>
                        </div>
                    </div>
                    
                    ${group.isOpen ? `
                        <div style="margin-top: 15px; border-top: 1px solid #E4ECE7; padding-top: 15px;">
                            <div style="margin-bottom: 12px;">
                                <button class="btn-primary" onclick="startGroupRecording(${gIdx})" id="recBtn_${gIdx}" style="font-size: 13px; padding: 8px 14px;">تسجيل صوتي جديد</button>
                            </div>
                            <div class="group-audios-list" style="display: flex; flex-direction: column; gap: 8px;">
                                ${(group.audios || []).map((a, aIdx) => `
                                    <div style="background: #F9FBF9; padding: 10px; border-radius: 8px; border: 1px solid #EFEFEF;">
                                        <input type="text" value="${a.title}" onchange="updateGroupAudioTitle(${gIdx}, ${aIdx}, this.value)" style="border:none; background:transparent; font-weight:600; width:100%; color: #333;">
                                        <audio controls src="${a.url}" style="width:100%; margin-top:6px;"></audio>
                                        <div style="text-align: left; margin-top: 4px;">
                                            <button class="btn-icon-text" style="color:var(--danger-color); font-size:11px;" onclick="deleteGroupAudio(${gIdx}, ${aIdx})">حذف الصوت</button>
                                        </div>
                                    </div>
                                `).join("")}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `).join("")}
        </div>
    `;

    document.getElementById("photosList").innerHTML = (content.photos || []).map((p, i) => `
        <div class="photo-wrapper">
            <img src="${p.url}">
            <button class="delete-btn" style="position:absolute; top:8px; right:8px; background:rgba(255,255,255,0.9); width:28px; height:28px; border-radius:50%; display:flex; justify-content:center; align-items:center;" onclick="askDelete('photos', ${i})">&times;</button>
        </div>`).join("");
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

// 10. منطق صفحات الدفتر المفتوح
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

// 11. الحذف والنقل
window.askDelete = (type, index) => {
    currentAction = { action: 'deleteItem', type, index };
    document.getElementById("confirmModal").classList.add("active");
};
document.getElementById("deleteBubbleBtn").addEventListener("click", () => {
    currentAction = { action: 'deleteBubble' }; document.getElementById("confirmModal").classList.add("active");
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
