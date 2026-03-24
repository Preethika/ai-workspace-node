import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import csv from "csv-parser";
import { ChromaClient } from "chromadb";
import {
    initVectorDB,
    addToIndex,
    searchIndex,
    saveIndex,
    loadStoredData,
    getStoredData
} from "./data_insights/vectorDB.js";

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });

const chroma = new ChromaClient();
let collection;

// init DB
async function initDB() {
    await chroma.deleteCollection({ name: "products" });

    collection = await chroma.createCollection({
        name: "products",
        embeddingFunction: {
            generate: async () => {
                throw new Error("Manual embeddings only");
            },
        },
    });
}
await initDB();

// Ollama embedding
async function getEmbedding(text) {
    const res = await fetch("http://localhost:11434/api/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "nomic-embed-text",
            prompt: text,
        }),
    });

    const data = await res.json();
    return data.embedding;
}

// Helper: Call Ollama (local LLM)
async function callOllama(prompt) {
    const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "llama3",
            prompt,
            stream: false,
        }),
    });

    const data = await response.json();
    return data.response;
}

function buildPrompt(messages) {    //setting context for the model, so it knows how to respond to the user
    let prompt = "You are a helpful JavaScript tutor.\n\n";

    for (const msg of messages) {
        if (msg.role === "user") {
            prompt += `User: ${msg.content}\n`;
        } else if (msg.role === "assistant") {
            prompt += `Assistant: ${msg.content}\n`;
        }
    }

    prompt += "Assistant:";
    return prompt;
}

// function cosineSimilarity(a, b) {
//     const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
//     const magA = Math.sqrt(a.reduce((sum, val) => sum + val ** 2, 0));
//     const magB = Math.sqrt(b.reduce((sum, val) => sum + val ** 2, 0));

//     return dot / (magA * magB);
// }

app.post("/add", async (req, res) => {
    const { items } = req.body;
    console.log('Adding items:', items)
    for (const item of items) {
        const embedding = await getEmbedding(`${item.name}. Category: ${item.category}. Description: ${item.description}`);

        await collection.add({
            ids: [item.id],
            documents: [item.name],
            embeddings: [embedding],
            metadatas: [{ category: "accessories" }],
        });
    }

    res.json({ message: "Data indexed" });
});

app.post("/search", async (req, res) => {
    const { query } = req.body;

    const queryEmbedding = await getEmbedding(query);

    const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: 5,
    });

    res.json(results);
});

app.post("/aiSearch", async (req, res) => {
    const { query } = req.body;

    const queryEmbedding = await getEmbedding(query);
    const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: 3,
    });

    const context = results.documents[0].join("\n");
    const prompt = `Answer using this data:\n${context}\n\nQuestion: ${query}`;

    const answer = await callOllama(prompt);

    res.json({ answer });
});


app.post("/upload", upload.single("file"), (req, res) => {
    const results = [];
    console.log("File uploaded:", req.file.path);
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", async () => {
            try {
                for (let i = 0; i < results.length; i++) {
                    const row = results[i];
                    const text = Object.values(row).join(" ");

                    const embedding = await getEmbedding(text);
                    addToIndex(embedding, { text, row }, i);
                }

                saveIndex();

                res.json({ message: "CSV indexed successfully" });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
            }
        });
});

// Ask question (RAG)
app.post("/ask", async (req, res) => {
    const { question } = req.body;

    try {
        const queryEmbedding = await getEmbedding(question);

        const results = searchIndex(queryEmbedding, 5);

        const context = results.map((r) => r.text).join("\n");

        const prompt = `
            You are a data analyst.

            Relevant Data:
            ${context}

            Question: ${question}

            Answer clearly based only on the data.
            `;

        const answer = await callOllama(prompt);
        console.log('Answer:', answer)
        res.json({ answer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/insightsRevenue", async (req, res) => {
    try {
        const data = getStoredData().slice(0, 20)
            .map((d) => d.text)
            .join("\n");

        const prompt = `
            give region wise revenue forecast for next quarter. Return ONLY valid JSON. Do not include explanation or markdown: 
            Use this exact structure:
           [ {"region": "<region>", "sales": "<sales>" }]
            ${data}
            `;

        const insights = await callOllama(prompt);
        console.log('Insights:', insights)
        res.json({ insights });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/insightsProduct", async (req, res) => {
    try {
        const sampleData = getStoredData().slice(0, 20)
            .map((d) => d.text)
            .join("\n");

        const prompt = `
            give region wise single top selling product. Return ONLY valid JSON. Do not include explanation or markdown.
            Use this exact structure:
            {"<region>": { "product": "<product>", "quantity": "<quantity>" }}
            ${sampleData}
            `;

        const insights = await callOllama(prompt);
        res.json({ insights });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/insights", async (req, res) => {
    try {
        const sampleData = getStoredData().slice(0, 20)
            .map((d) => d.text)
            .join("\n");

        const prompt = `
            Analyze this dataset and give top insights:
            ${sampleData}
            `;

        const insights = await callOllama(prompt);
        console.log('Insights:', insights)
        res.json({ insights });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/chat", async (req, res) => {
    try {
        const { messages } = req.body;

        const prompt = buildPrompt(messages);

        const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3",
                prompt
            })
        });

        res.setHeader("Content-Type", "text/plain");

        const reader = ollamaResponse.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter(Boolean);

            for (const line of lines) {
                const parsed = JSON.parse(line);
                if (parsed.response) {
                    res.write(parsed.response);
                }
            }
        }

        res.end();

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
    initVectorDB();
    loadStoredData();
});