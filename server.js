import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/chat", async (req, res) => {
    try {
        const { message } = req.body;

        const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3",
                prompt: `You are a helpful JavaScript tutor.\nAlways respond in proper Markdown format.\n\nUser: ${message}\nAssistant:`
                // stream defaults to true
            })
        });

        // Tell browser we're streaming
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Transfer-Encoding", "chunked");

        const reader = ollamaResponse.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
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
        console.error(err);
        res.status(500).json({ error: "Streaming failed" });
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});