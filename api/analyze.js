export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not set.' });
        }

        const { photoData, notes, manualScore, manualQuestionsData } = req.body;
        
        let contents = [];
        
        // Build the prompt using both the image, notes, and the user's manual checklist answers
        const prompt = `You are the ship computer of the Hail Mary, analyzing potential astrophage or alien organisms. 
Determine if this subject exhibits signs of biological life based on the provided visual data, user notes, and manual checklist answers.

User Notes: "${notes || 'No notes provided'}"
User's Manual Checklist Data: ${manualQuestionsData || 'None'}
User's Manual Score: ${manualScore}/6

Analyze the provided image (if any) and the context.
Respond in STRICT JSON format matching this schema:
{
  "classification": "LIKELY NON-LIVING" | "UNCERTAIN" | "POSSIBLY LIVING",
  "explanation": "A short, sci-fi analytical explanation (max 3 sentences) of your reasoning as the ship's computer."
}`;

        let parts = [{ text: prompt }];

        if (photoData) {
            // photoData is a dataURL: "data:image/jpeg;base64,/9j/4AAQ..."
            const match = photoData.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) {
                const mimeType = match[1];
                const base64Data = match[2];
                parts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                });
            }
        }

        contents.push({ parts });

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const apiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: contents,
                generationConfig: {
                    responseMimeType: "application/json"
                }
            })
        });

        const data = await apiRes.json();

        if (data.error) {
            console.error("Gemini API Error:", data.error);
            return res.status(500).json({ error: data.error.message });
        }

        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textResponse) {
            return res.status(500).json({ error: 'Unrecognized response from AI' });
        }

        // Clean out any potential markdown backticks from the json response
        const cleanJson = textResponse.replace(/^```json/g, '').replace(/```$/g, '').trim();
        const result = JSON.parse(cleanJson);
        
        res.status(200).json(result);
    } catch (error) {
        console.error("Serverless Function Error:", error);
        res.status(500).json({ error: 'An error occurred while analyzing the specimen.' });
    }
}
