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

const container = document.getElementById("mindmap");
const data = { nodes: nodesData, edges: edgesData };
const options = {
    nodes: {
        shape: "dot", size: 16,
        color: { background: "#F2F7F4", border: "#E4ECE7", highlight: { background: "#D9EBE4", border: "#C2DACF" } },
        font: { family: "Plus Jakarta Sans", color: "#4A5D54", size: 12 },
        borderWidth: 2
    },
    edges: { color: { color: "#C2DACF" }, smooth: { type: "continuous" }, width: 1.5 },
    physics: { enabled: false },
    interaction: { hover: true, dragNodes: true },
    manipulation: { enabled: false, addEdge: async function(edgeData, callback) {
        if(edgeData.from !== edgeData.to) {
            await addDoc(collection(db, "connections"), { from: edgeData.from, to: edgeData.to }).catch(e=>console.error(e));
            callback(edgeData);
        }
    }}
};
const network = new vis.Network(container, data, options);

network.on("dragEnd", async function (params) {
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const pos = network.getPosition(nodeId);
        await updateDoc(doc(db, "bubbles", nodeId), { x: pos.x, y: pos.y }).catch(e=>console.error(e));
    }
});

onSnapshot(collection(db, "bubbles"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        const d = change.doc.data();
        if (change.type === "added" || change.type === "modified") {
            nodesData.update({ id: change.doc.id, label: d.title, x: d.x, y: d.y, content: d.content });
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
const basket = document.getElementById("bubbleBasket");
async function createNewBubble(x, y) {
    const rect = container.getBoundingClientRect();
    const pos = network.DOMtoCanvas({ x: x - rect.left, y: y - rect.top });
    await addDoc(collection(db, "bubbles"), {
        title: "Neuer Gedanke", x: pos.x || 0, y: pos.y || 0,
        content: { quickNotes: [], notebooks: [], audioGroups: [], photos: [] }
    });
}

basket.addEventListener("dragend", (e) => createNewBubble(e.clientX, e.clientY));
basket.addEventListener("touchend", (e) => {
    if(e.changedTouches && e.changedTouches[0]) createNewBubble(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
});
basket.addEventListener("click", () => {
    const center = network.getViewPosition();
    addDoc(collection(db, "bubbles"), {
        title: "Neuer Gedanke", x: center.x, y: center.y,
        content: { quickNotes: [], notebooks: [], audioGroups: [], photos: [] }
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
        document.getElementById("bubbleTitleInput").value = bubble.label || "";
        document.getElementById("contentModal").classList.add("active");
    }
});

// الإرسال المباشر للرابط الصحيح في GitHub Pages / Server
document.getElementById("openSubmapBtn").addEventListener("click", () => {
    if(activeBubbleId) {
        window.location.href = `./submap.html?parentId=${activeBubbleId}`;
    }
});

document.getElementById("bubbleTitleInput").addEventListener("input", async (e) => {
    if (activeBubbleId) {
        await updateDoc(doc(db, "bubbles", activeBubbleId), { title: e.target.value }).catch(e=>console.error(e));
    }
});

document.getElementById("closeContentModal").addEventListener("click", () => {
    document.getElementById("contentModal").classList.remove("active");
});

document.getElementById("deleteBubbleBtn").addEventListener("click", async () => {
    if(activeBubbleId) {
        await deleteDoc(doc(db, "bubbles", activeBubbleId));
        document.getElementById("contentModal").classList.remove("active");
    }
});
