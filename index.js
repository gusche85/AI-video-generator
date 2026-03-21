export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { productName, angle } = req.body;

    // 🧠 1. Generate script
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `Create a 15-second TikTok script.

Product: ${productName}
Angle: ${angle}

Rules:
- Strong hook in first line
- Short, punchy sentences
- Natural tone
- End with CTA
- Max 60 words`
          }
        ]
      })
    });

    const aiData = await aiRes.json();
    const script = aiData.choices?.[0]?.message?.content || "No script";

    // 🔊 2. Generate voice
    const voiceRes = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb",
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: script,
          model_id: "eleven_multilingual_v2"
        })
      }
    );

    const audioBuffer = await voiceRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // 🎬 3. Create video using Shotstack API
    const shotstackRes = await fetch("https://api.shotstack.io/v1/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.SHOTSTACK_API_KEY
      },
      body: JSON.stringify({
        timeline: {
          tracks: [
            {
              clips: [
                {
                  asset: {
                    type: "image",
                    src: "https://picsum.photos/720/1280"
                  },
                  start: 0,
                  length: 15,
                  fit: "cover"
                }
              ]
            },
            {
              clips: [
                {
                  asset: {
                    type: "audio",
                    src: `data:audio/mp3;base64,${audioBase64}`
                  },
                  start: 0,
                  length: 15
                }
              ]
            },
            {
              clips: [
                {
                  asset: {
                    type: "title",
                    text: script,
                    style: "minimal",
                    size: "small"
                  },
                  start: 0,
                  length: 15,
                  position: "bottom"
                }
              ]
            }
          ]
        },
        output: {
          format: "mp4",
          resolution: "sd"
        }
      })
    });

    const shotData = await shotstackRes.json();

    const renderId = shotData.response.id;

    // ⏳ 4. Poll for video result
    let videoUrl = null;

    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));

      const statusRes = await fetch(
        `https://api.shotstack.io/v1/render/${renderId}`,
        {
          headers: {
            "x-api-key": process.env.SHOTSTACK_API_KEY
          }
        }
      );

      const statusData = await statusRes.json();

      if (statusData.response.status === "done") {
        videoUrl = statusData.response.url;
        break;
      }
    }

    if (!videoUrl) {
      return res.json({
        script,
        message: "Video still processing, try again in a few seconds"
      });
    }

    // ✅ Final response
    res.status(200).json({
      success: true,
      script,
      videoUrl
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
}
