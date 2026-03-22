export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { input, angle, duration } = req.body;

    const videoLength = parseInt(duration) || 15;

    let productName = "Trending product";
    let productImage = "https://picsum.photos/720/1280";

    // ✅ STEP 1: RapidAPI TikTok extraction
    if (input && input.includes("tiktok.com")) {
      try {
        const rapidRes = await fetch(
          "https://YOUR-RAPIDAPI-ENDPOINT",
          {
            method: "GET",
            headers: {
              "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
              "X-RapidAPI-Host": process.env.RAPIDAPI_HOST
            }
          }
        );

        const rapidData = await rapidRes.json();

        // ⚠️ Adjust based on API response structure
        productName =
          rapidData.title ||
          rapidData.data?.title ||
          productName;

        productImage =
          rapidData.cover ||
          rapidData.data?.cover ||
          productImage;

      } catch (e) {
        console.log("RapidAPI failed, using fallback");
      }
    }

    // 🧠 STEP 2: OpenAI script
    let script = "You need to see this!";

    try {
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
              content: `Create a ${videoLength}s TikTok script.

Product: ${productName}
Angle: ${angle}

Hook + benefits + CTA.`
            }
          ]
        })
      });

      const aiData = await aiRes.json();
      script = aiData.choices?.[0]?.message?.content || script;

    } catch (e) {
      console.log("AI failed");
    }

    // 🔊 STEP 3: Voice
    let audioBase64 = null;

    try {
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
      audioBase64 = Buffer.from(audioBuffer).toString("base64");

    } catch (e) {
      console.log("Voice failed");
    }

    // 🎬 STEP 4: Shotstack video
    let videoUrl = null;

    try {
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
                    length: videoLength,
                    fit: "cover"
                  }
                ]
              },
              ...(audioBase64 ? [{
                clips: [{
                  asset: {
                    type: "audio",
                    src: `data:audio/mp3;base64,${audioBase64}`
                  },
                  start: 0,
                  length: videoLength
                }]
              }] : []),
              {
                clips: [
                  {
                    asset: {
                      type: "title",
                      text: script,
                      style: "minimal"
                    },
                    start: 0,
                    length: videoLength,
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
      const renderId = shotData?.response?.id;

      // Poll video
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

    } catch (e) {
      console.log("Video failed");
    }

    // ✅ FINAL
    res.status(200).json({
      success: true,
      productName,
      productImage,
      script,
      videoUrl
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}
