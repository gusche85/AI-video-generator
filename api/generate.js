export default async function handler(req, res) {
  try {
    const { input, angle, duration } = req.body;

    let productName = input;
    let productImage = "https://picsum.photos/720/1280";

    // 🎯 Detect TikTok link
    const isTikTok = input.includes("vt.tiktok.com");

    if (isTikTok) {
      try {
        const pageRes = await fetch(input, {
          headers: {
            "User-Agent": "Mozilla/5.0"
          }
        });

        const html = await pageRes.text();

        // Extract caption
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
        if (titleMatch) productName = titleMatch[1];

        // Extract thumbnail
        const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (imageMatch) productImage = imageMatch[1];

      } catch (err) {
        console.log("TikTok extraction failed");
      }
    }

    // 🧠 Generate script
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
            content: `Create a ${duration || "15s"} TikTok script.

Based on this content: ${productName}

Angle: ${angle}

Hook + benefits + CTA.
Make it engaging and scroll-stopping.`
          }
        ]
      })
    });

    const aiData = await aiRes.json();
    const script = aiData.choices?.[0]?.message?.content || "No script";

    // 🔊 Voice
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

    // 🎬 Create video
    const shotRes = await fetch("https://api.shotstack.io/v1/render", {
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
                    src: productImage
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

    const shotData = await shotRes.json();
    const renderId = shotData.response.id;

    let videoUrl = null;

    for (let i = 0; i < 20; i++) {
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

    res.json({
      success: true,
      productName,
      productImage,
      script,
      videoUrl
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed" });
  }
}
