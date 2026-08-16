import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// Lese die ID der Bubble aus der URL ab
const urlParams = new URLSearchParams(window.location.search);
const parentBubbleId = urlParams.get('bubbleId');
const parentTitle = urlParams.get('title') || 'Submap';

// Falls keine ID vorhanden ist, zur Hauptseite zurückschicken
if(!parentBubbleId) window.location.href = "index.html";

document.getElementById('submapTitleDisplay').innerText = parentTitle;
document.getElementById('backToMainBtn').addEventListener('click', () => window.location.href = "index.html");

let subNodesData = new vis.DataSet([]);
let subEdgesData = new vis.DataSet([]);
let activeNodeId = null;
let pendingAction = null;

// Eigene Datenbank-Listen für jede Submap
const subNodesRef = collection(db, `bubbles/${parentBubbleId}/subnodes`);
const subEdgesRef = collection(db, `bubbles/${parentBubbleId}/subedges`);

const container = document.getElementById("submindmap");
const data = { nodes: subNodesData, edges: subEdgesData };

// Vis.js Konfiguration für eckige, breite Boxen
const options = {
    nodes: {
        shape: "box",
        margin: 16,
        widthConstraint: { minimum: 150, maximum: 280 },
        color: { 
            background: "#F2F7F4", border: "#E4ECE7", 
            highlight: { background: "#D9EBE4", border: "#C2DACF" } 
        },
        font: { multi: 'html', family: "Plus Jakarta Sans", color: "#4A5D54", size: 14 },
        borderWidth: 2, shadow: { enabled: true, color: "rgba(74, 93, 84, 0.04)", size: 12 }
    },
    edges: { color: { color: "#C2DACF", highlight: "#A7CBB9" }, smooth: { type: "continuous" }, width: 2 },
    physics: { enabled: false }, // Ohne Physik, freies Verschieben
    interaction: { hover: true, dragNodes: true },
    manipulation: {
        enabled: false,
        addEdge: async function(edgeData, callback) {
            if(edgeData.from !== edgeData.to) {
                await addDoc(subEdgesRef, { from: edgeData.from, to: edgeData.to });
                callback(edgeData);
            }
        }
    }
};
const network = new vis.Network(container, data, options);

// Funktion, um den Titel und Text formatgerecht zusammenzufügen (mit HTML-Tags)
function formatLabel(title, text, showText) {
    let label = "<b>" + (title || "Ohne Titel") + "</b>";
    if (showText && text) label += "\n\n" + text;
    return label;
}

// Submap initialisieren
async function initSubmap() {
    const snap = await getDocs(subNodesRef);
    if (snap.empty) {
        // Erstellt den Hauptknotenpunkt in der Mitte, wenn noch nichts da ist
        await addDoc(subNodesRef, {
            title: parentTitle, text: "Hauptgedanke", x: 0, y: 0, showText: false, isCentral: true
        });
    }
    
    // Nodes lauschen
    onSnapshot(subNodesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const d = change.doc.data();
            if (change.type === "added" || change.type === "modified") {
                subNodesData.update({ 
                    id: change.doc.id, 
                    label: formatLabel(d.title, d.text, d.showText), 
                    x: d.x, y: d.y, 
                    titleData: d.title, textData: d.text, 
                    showText: d.showText, isCentral: d.isCentral 
                });
            }
            if (change.type === "removed") subNodesData.remove(change.doc.id);
        });
    });

    // Edges lauschen
    onSnapshot(subEdgesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const d = change.doc.data();
            if (change.type === "added") subEdgesData.update({ id: change.doc.id, from: d.from, to: d.to });
            if (change.type === "removed") subEdgesData.remove(change.doc.id);
        });
    });
}
initSubmap();

// Verschieben speichern
network.on("dragEnd", async function (params) {
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const position = network.getPosition(nodeId);
        await updateDoc(doc(subNodesRef, nodeId), { x: position.x, y: position.y });
    }
});

// Verbindungsmodus 
document.getElementById("subConnectSwitch").addEventListener("change", (e) => {
    if (e.target.checked) network.addEdgeMode();
    else network.disableEditMode();
});

// Einzelner Klick auf Block (Text anzeigen/verbergen) oder Klick auf Verbindung (Löschen)
network.on("click", async (params) => {
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = subNodesData.get(nodeId);
        const newState = !node.showText; // Schaltet den Zustand um
        
        // Speichert lokale Änderung sofort für flüssigere Animation
        subNodesData.update({ id: nodeId, label: formatLabel(node.titleData, node.textData, newState), showText: newState });
        
        // Sichert in der Cloud
        await updateDoc(doc(subNodesRef, nodeId), { showText: newState });
    } else if (params.edges.length > 0) {
        // Ein Klick auf eine Verbindungslinie bietet an, diese zu löschen
        pendingAction = { type: 'edge', id: params.edges[0] };
        document.getElementById("confirmSubModal").classList.add("active");
    }
});

// Doppelklick auf Block (Öffnet Editor-Menü)
network.on("doubleClick", (params) => {
    if (params.nodes.length > 0) {
        activeNodeId = params.nodes[0];
        const node = subNodesData.get(activeNodeId);
        document.getElementById("nodeTitleInput").value = node.titleData || "";
        document.getElementById("nodeTextInput").value = node.textData || "";
        document.getElementById("editNodeModal").classList.add("active");
        
        // Der zentrale Knotenpunkt kann nicht gelöscht werden
        document.getElementById("deleteNodeBtn").style.display = node.isCentral ? "none" : "block"; 
    }
});

// Neuen Block durch Tippen auf Button hinzufügen (zentriert)
document.getElementById("addNodeBasket").addEventListener("click", async () => {
    const center = network.getViewPosition(); // Holt die Mitte des aktuellen Bildausschnitts
    await addDoc(subNodesRef, {
        title: "Neuer Block", text: "Schreiben Sie Ihren Text hier...", 
        x: center.x, y: center.y + 100, showText: false, isCentral: false
    });
});

// Editor-Aktionen (Speichern und Schließen)
document.getElementById("closeEditModal").addEventListener("click", () => document.getElementById("editNodeModal").classList.remove("active"));

document.getElementById("saveNodeBtn").addEventListener("click", async () => {
    if (activeNodeId) {
        const newTitle = document.getElementById("nodeTitleInput").value;
        const newText = document.getElementById("nodeTextInput").value;
        await updateDoc(doc(subNodesRef, activeNodeId), { title: newTitle, text: newText });
        document.getElementById("editNodeModal").classList.remove("active");
    }
});

// Knotenpunkt löschen Vorbereitung
document.getElementById("deleteNodeBtn").addEventListener("click", () => {
    pendingAction = { type: 'node', id: activeNodeId };
    document.getElementById("editNodeModal").classList.remove("active");
    document.getElementById("confirmSubModal").classList.add("active");
});

// Bestätigungsfenster-Aktionen (Endgültiges Löschen von Linien oder Blöcken)
document.getElementById("cancelSubConfirmBtn").addEventListener("click", () => document.getElementById("confirmSubModal").classList.remove("active"));

document.getElementById("actionSubConfirmBtn").addEventListener("click", async () => {
    if (pendingAction) {
        if (pendingAction.type === 'node') {
            await deleteDoc(doc(subNodesRef, pendingAction.id));
            // Löscht auch alle zugehörigen Verbindungslinien dieses Kästchens
            const edgesToRemove = subEdgesData.get({ filter: e => e.from === pendingAction.id || e.to === pendingAction.id });
            edgesToRemove.forEach(async e => await deleteDoc(doc(subEdgesRef, e.id)));
        } else if (pendingAction.type === 'edge') {
            await deleteDoc(doc(subEdgesRef, pendingAction.id));
        }
        pendingAction = null;
        document.getElementById("confirmSubModal").classList.remove("active");
    }
});
