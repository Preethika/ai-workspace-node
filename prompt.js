const generatePrompt = () => {
    system: "You are a helpful assistant.",
        user: "What is the capital of France?",
}

const prompt = `You are a data analyst.\n\nDataset:\n${JSON.stringify(dataset).slice(0, 4000)}\n\nQuestion: ${question}\n\nGive a clear and concise answer.`;
const prompt = `Analyze this dataset and give top 5 insights:\n${JSON.stringify(dataset).slice(0, 4000)}`;
