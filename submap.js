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

// قراءة معرّف الكرة الأم من الرابط
const urlParams = new URLSearchParams(window.location.search);
const parentId = urlParams.get('parentId');

if(!parentId) {
    alert("لم يتم تحديد كرة رئيسية!");
    window.location.href = "index.html";
}

document.getElementById("backToMainBtn").addEventListener("click", () => window.location.href = "index.html");

// إحضار عنوان الكرة الأم
getDoc(doc(db, "bubbles", parentId)).then(snap => {
    if(snap.exists()) {
        document.getElementById("parentTitleDisplay").innerText = "الخريطة الفرعية لـ: " + (snap.data().title || "بدون عنوان");
    }
});

let subNodesData = new vis.DataSet([]);
let subEdgesData = new vis.DataSet([]);
let activeSubNodeId = null;

const subContainer = document.getElementById("submapNetwork");
const subData = { nodes: subNodesData, edges: subEdgesData };
const subOptions = {
    nodes: {
        shape: "dot", size: 18,
        color: { background: "#E8F0EC", border: "#C2DACF", highlight: { background: "#D9EBE4", border: "#A7CBB9" } },
        font: { family: "Plus Jakarta Sans", color: "#4A5D54", size: 13 },
        borderWidth: 2
    },
    edges: { color: { color: "#C2DACF" }, width: 2 },
    physics: { enabled: false },
    interaction: { dragNodes: true, hover: true },
    manipulation: { enabled: false, addEdge: async function(edgeData, callback) {
        if(edgeData.from !== edgeData.to) {
            try {
                await addDoc(collection(db, "bubbles", parentId, "subConnections"), { from: edgeData.from, to: edgeData.to });
                callback(edgeData);
            } catch(e) { console.error(e); }
        }
    }}
};
const subNetwork = new vis.Network(subContainer, subData, subOptions);

subNetwork.on("dragEnd", async function (params) {
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const pos = subNetwork.getPosition(nodeId);
        await updateDoc(doc(db, "bubbles", parentId, "subNodes", nodeId), { x: pos.x, y: pos.y }).catch(e=>console.error(e));
    }
});

// المزامنة الحية للخرائط الفرعية Sub-collection
onSnapshot(collection(db, "bubbles", parentId, "subNodes"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        const d = change.doc.data();
        if (change.type === "added" || change.type === "modified") {
            subNodesData.update({ id: change.doc.id, label: d.title, x: d.x, y: d.y, note: d.note });
        }
        if (change.type === "removed") subNodesData.remove(change.doc.id);
    });
}, err => alert("فشل تحميل البيانات الفرعية: " + err.message));

onSnapshot(collection(db, "bubbles", parentId, "subConnections"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") subEdgesData.update({ id: change.doc.id, from: change.doc.data().from, to: change.doc.data().to });
        if (change.type === "removed") subEdgesData.remove(change.doc.id);
    });
});

// إنشاء عقدة فرعية لدعم اللمس والماوس والضغط
const subBasket = document.getElementById("subBasket");
async function createSubNode(x, y) {
    try {
        const rect = subContainer.getBoundingClientRect();
        const pos = subNetwork.DOMtoCanvas({ x: x - rect.left, y: y - rect.top });
        await addDoc(collection(db, "bubbles", parentId, "subNodes"), {
            title: "Unter-Gedanke", x: pos.x || 0, y: pos.y || 0, note: ""
        });
    } catch(err) { alert("خطأ في إنشاء العنصر الفرعي: " + err.message); }
}

subBasket.addEventListener("dragend", (e) => createSubNode(e.clientX, e.clientY));
subBasket.addEventListener("touchend", (e) => {
    if(e.changedTouches && e.changedTouches[0]) {
        createSubNode(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
});
subBasket.addEventListener("click", () => {
    const center = subNetwork.getViewPosition();
    addDoc(collection(db, "bubbles", parentId, "subNodes"), {
        title: "Unter-Gedanke", x: center.x, y: center.y, note: ""
    }).catch(e=>alert(e.message));
});

document.getElementById("subConnectSwitch").addEventListener("change", (e) => {
    if (e.target.checked) subNetwork.addEdgeMode();
    else subNetwork.disableEditMode();
});

subNetwork.on("doubleClick", (params) => {
    if (params.nodes.length > 0) {
        activeSubNodeId = params.nodes[0];
        const node = subNodesData.get(activeSubNodeId);
        document.getElementById("subNodeTitleInput").value = node.label || "";
        document.getElementById("subNodeNoteInput").value = node.note || "";
        document.getElementById("subModal").classList.add("active");
    }
});

// حفظ البيانات المباشر للفرعية
document.getElementById("subNodeTitleInput").addEventListener("input", async (e) => {
    if(activeSubNodeId) {
        await updateDoc(doc(db, "bubbles", parentId, "subNodes", activeSubNodeId), { title: e.target.value }).catch(e=>console.error(e));
    }
});

document.getElementById("subNodeNoteInput").addEventListener("input", async (e) => {
    if(activeSubNodeId) {
        await updateDoc(doc(db, "bubbles", parentId, "subNodes", activeSubNodeId), { note: e.target.value }).catch(e=>console.error(e));
    }
});

document.getElementById("closeSubModal").addEventListener("click", () => document.getElementById("subModal").classList.remove("active"));

document.getElementById("deleteSubNodeBtn").addEventListener("click", async () => {
    if(activeSubNodeId) {
        await deleteDoc(doc(db, "bubbles", parentId, "subNodes", activeSubNodeId));
        document.getElementById("subModal").classList.remove("active");
    }
});
