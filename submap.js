import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

const urlParams = new URLSearchParams(window.location.search);
const parentId = urlParams.get('parentId');

if(!parentId) {
    window.location.href = "./index.html";
}

document.getElementById("backToMainBtn").addEventListener("click", () => {
    window.location.href = "./index.html";
});

let subNodesData = new vis.DataSet([]);
let subEdgesData = new vis.DataSet([]);
let activeSubNodeId = null;

const subContainer = document.getElementById("submapNetwork");
const subData = { nodes: subNodesData, edges: subEdgesData };

// بناء البطاقات العريضة داخل Canvas بمرونة
function buildNodeBox(title, note, isExpanded, isRoot = false) {
    const titleText = title || "Neuer Knoten";
    const noteText = note || "";
    const showNote = isExpanded && noteText.trim().length > 0;
    
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="220" height="${showNote ? 120 : 65}">
        <rect x="0" y="0" width="220" height="${showNote ? 120 : 65}" rx="12" 
              fill="${isRoot ? '#D9EBE4' : '#FFFFFF'}" stroke="${isRoot ? '#A7CBB9' : '#E4ECE7'}" stroke-width="2"/>
        <foreignObject x="10" y="8" width="200" height="50">
            <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:sans-serif; font-size:11px; font-weight:bold; color:#4A5D54; line-height:1.2; max-height:42px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">
                ${titleText}
            </div>
        </foreignObject>
        ${showNote ? `
        <line x1="10" y1="58" x2="210" y2="58" stroke="#E4ECE7" stroke-width="1"/>
        <foreignObject x="10" y="62" width="200" height="50">
            <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:sans-serif; font-size:9px; color:#8A9D93; line-height:1.2; max-height:48px; overflow:y-auto;">
                ${noteText}
            </div>
        </foreignObject>` : ''}
    </svg>`;
    
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

const subOptions = {
    nodes: { shape: "image" },
    edges: { color: { color: "#C2DACF" }, width: 1.5 },
    physics: { enabled: false },
    interaction: { dragNodes: true, hover: true }
};
const subNetwork = new vis.Network(subContainer, subData, subOptions);

// إحضار وتوليد المربع الأساسي (السنتر) باسم الكرة
getDoc(doc(db, "bubbles", parentId)).then(snap => {
    if(snap.exists()) {
        const rootTitle = snap.data().title || "Hauptgedanke";
        document.getElementById("parentTitleDisplay").innerText = rootTitle;
        
        // إظهار الكرة الأم في الوسط
        subNodesData.update({
            id: "root_node",
            image: buildNodeBox("⭐ " + rootTitle, "Basis-Element", true, true),
            x: 0, y: 0, fixed: false
        });
    }
});

subNetwork.on("dragEnd", async function (params) {
    if (params.nodes.length > 0 && params.nodes[0] !== "root_node") {
        const nodeId = params.nodes[0];
        const pos = subNetwork.getPosition(nodeId);
        await updateDoc(doc(db, "bubbles", parentId, "subNodes", nodeId), { x: pos.x, y: pos.y }).catch(e=>console.error(e));
    }
});

// المزامنة مع الحفظ في Firebase
onSnapshot(collection(db, "bubbles", parentId, "subNodes"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        const d = change.doc.data();
        if (change.type === "added" || change.type === "modified") {
            subNodesData.update({
                id: change.doc.id,
                image: buildNodeBox(d.title, d.note, d.isExpanded),
                x: d.x, y: d.y,
                rawTitle: d.title, rawNote: d.note, isExpanded: d.isExpanded
            });
        }
        if (change.type === "removed") subNodesData.remove(change.doc.id);
    });
});

onSnapshot(collection(db, "bubbles", parentId, "subConnections"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") subEdgesData.update({ id: change.doc.id, from: change.doc.data().from, to: change.doc.data().to });
        if (change.type === "removed") subEdgesData.remove(change.doc.id);
    });
});

// الضغط المزدوج للتعديل، والضغط المفرد لإظهار/إخفاء الشرح
subNetwork.on("click", async (params) => {
    if (params.nodes.length > 0 && params.nodes[0] !== "root_node") {
        const nodeId = params.nodes[0];
        const node = subNodesData.get(nodeId);
        const newExpandedState = !node.isExpanded;
        
        await updateDoc(doc(db, "bubbles", parentId, "subNodes", nodeId), {
            isExpanded: newExpandedState
        }).catch(e=>console.error(e));
    }
});

subNetwork.on("doubleClick", (params) => {
    if (params.nodes.length > 0 && params.nodes[0] !== "root_node") {
        activeSubNodeId = params.nodes[0];
        const node = subNodesData.get(activeSubNodeId);
        document.getElementById("subNodeTitleInput").value = node.rawTitle || "";
        const noteArea = document.getElementById("subNodeNoteInput");
        noteArea.value = node.rawNote || "";
        
        noteArea.style.height = "auto";
        noteArea.style.height = noteArea.scrollHeight + "px";
        
        document.getElementById("subModal").classList.add("active");
    }
});

// توسيع مربع الشرح تلقائياً أثناء الكتابة دون قيود
const noteInput = document.getElementById("subNodeNoteInput");
noteInput.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
    if(activeSubNodeId) {
        updateDoc(doc(db, "bubbles", parentId, "subNodes", activeSubNodeId), { note: this.value }).catch(e=>console.error(e));
    }
});

document.getElementById("subNodeTitleInput").addEventListener("input", async (e) => {
    if(activeSubNodeId) {
        await updateDoc(doc(db, "bubbles", parentId, "subNodes", activeSubNodeId), { title: e.target.value }).catch(e=>console.error(e));
    }
});

// إضافة عنصر جديد في الخريطة الفرعية
const subBasket = document.getElementById("subBasket");
async function createSubNode(x, y) {
    const rect = subContainer.getBoundingClientRect();
    const pos = subNetwork.DOMtoCanvas({ x: x - rect.left, y: y - rect.top });
    await addDoc(collection(db, "bubbles", parentId, "subNodes"), {
        title: "Neuer Unter-Knoten", note: "", isExpanded: true, x: pos.x || 0, y: pos.y || 0
    });
}

subBasket.addEventListener("dragend", (e) => createSubNode(e.clientX, e.clientY));
subBasket.addEventListener("touchend", (e) => {
    if(e.changedTouches && e.changedTouches[0]) createSubNode(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
});
subBasket.addEventListener("click", () => {
    const center = subNetwork.getViewPosition();
    addDoc(collection(db, "bubbles", parentId, "subNodes"), {
        title: "Neuer Unter-Knoten", note: "", isExpanded: true, x: center.x, y: center.y
    });
});

document.getElementById("subConnectSwitch").addEventListener("change", (e) => {
    if (e.target.checked) subNetwork.addEdgeMode();
    else subNetwork.disableEditMode();
});

document.getElementById("closeSubModal").addEventListener("click", () => document.getElementById("subModal").classList.remove("active"));

document.getElementById("deleteSubNodeBtn").addEventListener("click", async () => {
    if(activeSubNodeId) {
        await deleteDoc(doc(db, "bubbles", parentId, "subNodes", activeSubNodeId));
        document.getElementById("subModal").classList.remove("active");
    }
});
 