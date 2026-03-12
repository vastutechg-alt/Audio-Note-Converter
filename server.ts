import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Increase payload limit for base64 audio files
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Audio Note Converter Server is running" });
  });

  app.post("/api/convert", async (req, res) => {
    try {
      const { base64Data, mimeType, language, mode } = req.body;

      if (!base64Data || !mimeType) {
        return res.status(400).json({ error: "Missing audio data" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const genAI = new GoogleGenAI({ apiKey });

      const prompt = `
        You are an expert transcriber and content creator. 
        The provided audio is from a lecture or program by an architect.
        Language context: ${language === 'si' ? 'Sinhala' : language === 'en' ? 'English' : 'Auto-detect (likely Sinhala)'}.
        
        Task: 
        1. Transcribe the audio accurately.
        2. Based on the transcription, generate the following formats in Sinhala:
           - Clean Transcript (සම්පූර්ණ ලිවීම)
           - Article/Essay (රචනය)
           - Short Summary (සාරාංශය)
           - Questions only (ප්‍රශ්න)
           - Answers only (පිළිතුරු)
           - Q&A (ප්‍රශ්න සහ පිළිතුරු)
        
        Output Requirements:
        - Use professional Sinhala Unicode.
        - Handle technical architectural terms correctly (keep them in English if commonly used, but explain in Sinhala if needed).
        - Format the output as a JSON object with keys: transcript, article, summary, questions, answers, qa.
        - If a specific mode was requested (mode: ${mode}), focus heavily on that, but still provide the JSON structure.
      `;

      const result = await genAI.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              },
              { text: prompt }
            ]
          }
        ]
      });

      res.json({ text: result.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to process audio" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
