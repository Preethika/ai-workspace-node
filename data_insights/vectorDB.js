import hnswlib from "hnswlib-node";
import fs from "fs";

const { HierarchicalNSW } = hnswlib;

const dim = 768; // embedding size (Ollama nomic-embed-text)
const maxElements = 1000;
let index;
let storedData = [];

export function initVectorDB() {
    index = new HierarchicalNSW("cosine", dim);

    if (fs.existsSync("./hnsw_index.bin")) {
        index.readIndex("./hnsw_index.bin");
        console.log("✅ Loaded existing index");
    } else {
        index.initIndex(maxElements);
        console.log("🆕 Created new index");
    }
}

export function addToIndex(embedding, data, id) {
    index.addPoint(embedding, id);
    storedData[id] = data;
}

export function searchIndex(queryEmbedding, k = 5) {
    console.log({ queryEmbedding })
    const result = index.searchKnn(queryEmbedding, k);
    console.log({ result })

    return result.neighbors.map((id) => storedData[id]);
}

export const search = async (query) => {
    const queryEmbedding = await getEmbedding(query);

    const result = index.searchKnn(queryEmbedding, 5);

    return result.neighbors.map((id) => storedData[id]);
}

export function saveIndex() {
    index.writeIndex("./hnsw_index.bin");
    fs.writeFileSync("./storedData.json", JSON.stringify(storedData));
    console.log("💾 Index saved");
}

export function loadStoredData() {
    if (fs.existsSync("./storedData.json")) {
        storedData = JSON.parse(fs.readFileSync("./storedData.json"));
        console.log("📂 Loaded stored data");
    }
}
export function getStoredData() {
    return storedData;
}