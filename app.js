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

let nodesData = new vis.DataSet([]);
let edgesData = new vis.DataSet([]);
let activeBubbleId = null;
let isPhysicsOn = false; // الفيزياء مغلقة افتراضياً لاحترام الأماكن المحفوظة

const container = document.getElementById("mindmap");
const data = { nodes: nodesData, edges: edgesData };
const options = {
    nodes: { shape: "dot", size: 16, font: { size: 14, color: "#333" }, borderWidth: 2 },
    edges: { width: 2, color: "#cbd5e1" },
    physics: { enabled: isPhysicsOn }, // التحكم بالفيزياء
    interaction: { hover: true, dragNodes: true },
    manipulation: { enabled: false, addEdge: async function(edgeData, callback) {
        if(edgeData.from !== edgeData.to) {
            await addDoc(collection(db, "connections"), { from: edgeData.from, to: edgeData.to });
            callback(edgeData);
        }
    }}
};
const network = new vis.Network(container, data, options);

// تفعيل/تعطيل الحركة الفيزيائية (للمرح)
document.getElementById("physicsSwitch").addEventListener("change", (e) => {
    isPhysicsOn = e.target.checked;
    network.setOptions({ physics: { enabled: isPhysicsOn } });
});

// تفعيل/تعطيل الربط
document.getElementById("connectSwitch").addEventListener("change", (e) => {
    if (e.target.checked) network.addEdgeMode();
    else network.disableEditMode();
});

// حفظ المواقع عند السحب - بشرط أن يكون وضع المرح (الفيزياء) مغلقاً
network.on("dragEnd", async function (params) {
    if (isPhysicsOn) return; // لا تقم بالحفظ إذا كانت الفيزياء مفعلة لكي لا تدمر الإحداثيات!
    
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const pos = network.getPosition(nodeId);
        await updateDoc(doc(db, "bubbles", nodeId), { x: pos.x, y: pos.y });
    }
});

// جلب وعرض البيانات حياً
onSnapshot(collection(db, "bubbles"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        const d = change.doc.data();
        if (change.type === "added" || change.type === "modified") {
            nodesData.update({ id: change.doc.id, label: d.title, x: d.x, y: d.y, content: d.content });
            if (activeBubbleId === change.doc.id) renderContent(activeBubbleId);
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

// إنشاء عنصر جديد
document.getElementById("bubbleBasket").addEventListener("click", async () => {
    const center = network.getViewPosition();
    await addDoc(collection(db, "bubbles"), {
        title: "Neuer Gedanke", x: center.x, y: center.y,
        content: { quickNotes: [], notebooks: [] }
    });
});

// التنقل بين التبويبات (Tabs Logic)
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        
        e.currentTarget.classList.add("active");
        const targetTab = e.currentTarget.getAttribute("data-tab");
        document.getElementById(targetTab).classList.add("active");
    });
});

// فتح النافذة المنبثقة
network.on("doubleClick", (params) => {
    if (params.nodes.length > 0) {
        activeBubbleId = params.nodes[0];
        const bubble = nodesData.get(activeBubbleId);
        document.getElementById("bubbleTitleInput").value = bubble.label || "";
        document.getElementById("contentModal").classList.add("active");
        renderContent(activeBubbleId);
    }
});

// إغلاق النافذة
document.getElementById("closeContentModal").addEventListener("click", () => {
    document.getElementById("contentModal").classList.remove("active");
    activeBubbleId = null;
});

// عرض محتوى التبويبات والملاحظات
function renderContent(id) {
    const bubble = nodesData.get(id);
    if (!bubble) return;
    const content = bubble.content || { quickNotes: [], notebooks: [] };

    document.getElementById("quickNotesList").innerHTML = (content.quickNotes || []).map((n, i) => `
        <div class="item-card">
            <input type="text" value="${n.title || ''}" oninput="updateData('quickNotes', ${i}, 'title', this.value)" placeholder="Titel">
            <textarea oninput="updateData('quickNotes', ${i}, 'text', this.value)" placeholder="Notiz..." rows="3">${n.text || ''}</textarea>
            <button class="delete-btn" onclick="deleteItem('quickNotes', ${i})">Löschen</button>
        </div>`).join("");

    document.getElementById("notebooksList").innerHTML = (content.notebooks || []).map((nb, i) => `
        <div class="item-card">
            <input type="text" value="${nb.title || ''}" oninput="updateData('notebooks', ${i}, 'title', this.value)" placeholder="Buch Titel">
            <button class="delete-btn" onclick="deleteItem('notebooks', ${i})">Löschen</button>
        </div>`).join("");
}

// تحديث وحفظ فوري للبيانات الفرعية
window.updateData = async (type, index, field, value) => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content[type]) b.content[type] = [];
    b.content[type][index][field] = value;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

// إضافة وحذف
document.getElementById("addQuickNoteBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.quickNotes) b.content.quickNotes = [];
    b.content.quickNotes.push({ title: "Neue Notiz", text: "" });
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
});

document.getElementById("addNotebookBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.notebooks) b.content.notebooks = [];
    b.content.notebooks.push({ title: "Neues Buch" });
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
});

window.deleteItem = async (type, index) => {
    const b = nodesData.get(activeBubbleId);
    b.content[type].splice(index, 1);
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

// تحديث العنوان
document.getElementById("bubbleTitleInput").addEventListener("input", async (e) => {
    if (activeBubbleId) await updateDoc(doc(db, "bubbles", activeBubbleId), { title: e.target.value });
});

// الانتقال للخريطة الفرعية
document.getElementById("openSubmapBtn").addEventListener("click", () => {
    if(activeBubbleId) window.location.href = `submap.html?parentId=${activeBubbleId}`;
});

// حذف الكرة بأكملها
document.getElementById("deleteBubbleBtn").addEventListener("click", async () => {
    if(activeBubbleId) {
        await deleteDoc(doc(db, "bubbles", activeBubbleId));
        document.getElementById("contentModal").classList.remove("active");
    }
});
