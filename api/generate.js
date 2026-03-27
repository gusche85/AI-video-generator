async function uploadToCloudinary(base64Image) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: "POST",
      body: new URLSearchParams({
        file: base64Image,
        upload_preset: "mypreset" // default preset
      })
    }
  );

  const data = await res.json();

  if (!data.secure_url) {
    console.log("Cloudinary error:", data);
    throw new Error("Image upload failed");
  }

  return data.secure_url;
}



export default async function handler(req, res) {
  try {
    const { image, angle, duration } = req.body;

// ✅ Upload image first
let imageUrl = image;

try {
  imageUrl = await uploadToCloudinary(image);
} catch (e) {
  console.log("Image upload failed");
}

    const videoLength = parseInt(duration) || 15;

    // 🧠 1. Analyze image
    let productDescription = "A trendy product";

    try {
      const visionRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
              content: [
                { type: "text", text: "Describe this product for a TikTok ad." },
                { type: "image_url", image_url: { url: imageURL } }
              ]
            }
          ]
        })
      });

      const data = await visionRes.json();
      productDescription = data.choices?.[0]?.message?.content || productDescription;

    } catch (e) {
      console.log("Vision failed");
    }

    // ✍️ 2. Generate script split into scenes
    let scenes = ["You need this now!"];

    try {
      const scriptRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
              content: `Create a ${videoLength}s TikTok ad script.

Product:
${productDescription}

Angle: ${angle}

Split into 3 short lines (for captions).`
            }
          ]
        })
      });

      const scriptData = await scriptRes.json();
      const fullText = scriptData.choices?.[0]?.message?.content || "";

      scenes = fullText.split("\n").filter(s => s.trim());

    } catch (e) {
      console.log("Script failed");
    }

    const fullScript = scenes.join(" ");

    // 🔊 3. Voice
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
            text: fullScript,
            model_id: "eleven_multilingual_v2"
          })
        }
      );

      const audioBuffer = await voiceRes.arrayBuffer();
      audioBase64 = Buffer.from(audioBuffer).toString("base64");

    } catch (e) {
      console.log("Voice failed");
    }

    // 🎬 4. Build TikTok-style timeline
    const sceneDuration = videoLength / scenes.length;

    const captionClips = scenes.map((text, i) => ({
      asset: {
        type: "title",
        text: text,
        style: "minimal"
      },
      start: i * sceneDuration,
      length: sceneDuration,
      position: "center"
    }));

    const zoomClip = {
      asset: {
        type: "image",
        src: imageUrl
      },
      start: 0,
      length: videoLength,
      fit: "cover",
      scale: 1.1 // slight zoom
    };

    // 🎥 5. Render video
    let videoUrl = null;

    try {
      const shotRes = await fetch("https://api.shotstack.io/edit/stage/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.SHOTSTACK_API_KEY
        },
        body: JSON.stringify({
          timeline: {
            tracks: [
              { clips: [zoomClip] },
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
              { clips: captionClips }
            ]
          },
          output: {
            format: "mp4",
            resolution: "sd",
            aspectRatio: "9:16"
          }
        })
      });

      const shotData = await shotRes.json();
      const renderId = shotData?.response?.id;

      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));

        const statusRes = await fetch(
        `https://api.shotstack.io/edit/stage/render/${renderId}`,
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

    res.json({
      success: true,
      script: fullScript,
      videoUrl
    });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}
