import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

function buildPrompt(messages) {
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

app.post("/api/chat", async (req, res) => {
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
        res.status(500).json({ error: "Streaming failed" });
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});