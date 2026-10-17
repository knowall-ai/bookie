#!/usr/bin/env python3
"""Record Bookie's real Teams voice reading a script verbatim.

Uses the gpt-realtime-2.1 deployment on Bookie's own Azure OpenAI resource over WebSocket,
voice "cedar" (the call-bot's VOICE_REALTIME_VOICE), and writes 24 kHz mono PCM16 WAV.
The key comes from AZURE_OPENAI_KEY in the environment and is never printed.

usage: AZURE_OPENAI_KEY=... realtime_voice.py --script script.txt --out take.wav
       [--endpoint https://ka-bookie-ai-swc.cognitiveservices.azure.com] [--model gpt-realtime-2.1]
"""
import argparse, asyncio, base64, json, os, wave
import websockets

ap = argparse.ArgumentParser()
ap.add_argument("--script", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--endpoint", default="https://ka-bookie-ai-swc.cognitiveservices.azure.com")
ap.add_argument("--model", default="gpt-realtime-2.1"); ap.add_argument("--voice", default="cedar")
args = ap.parse_args()
text = open(args.script).read().strip()

INSTRUCTIONS = (
    "You are a voice actor recording a narration. Read the user's script aloud EXACTLY as written, "
    "word for word, with nothing added, removed or changed: no greeting, no preamble, no comment afterwards. "
    "Speak in a calm, warm, precise British English voice with a light touch of dry wit, at an unhurried "
    "natural pace, like a trusted bookkeeper welcoming a new client. Pause briefly at full stops.")

async def main():
    url = args.endpoint.replace("https://", "wss://").rstrip("/") + f"/openai/v1/realtime?model={args.model}"
    async with websockets.connect(url, extra_headers={"api-key": os.environ["AZURE_OPENAI_KEY"]},
                                  max_size=None) as ws:
        await ws.send(json.dumps({"type": "session.update", "session": {
            "type": "realtime", "instructions": INSTRUCTIONS, "output_modalities": ["audio"],
            "audio": {"output": {"voice": args.voice, "format": {"type": "audio/pcm", "rate": 24000}}}}}))
        await ws.send(json.dumps({"type": "conversation.item.create", "item": {
            "type": "message", "role": "user",
            "content": [{"type": "input_text", "text": "Script to read verbatim:\n\n" + text}]}}))
        await ws.send(json.dumps({"type": "response.create"}))
        pcm, transcript = bytearray(), []
        async for raw in ws:
            ev = json.loads(raw); t = ev.get("type", "")
            if t in ("response.output_audio.delta", "response.audio.delta"):
                pcm += base64.b64decode(ev["delta"])
            elif t in ("response.output_audio_transcript.delta", "response.audio_transcript.delta"):
                transcript.append(ev["delta"])
            elif t == "session.updated":
                print("voice:", ev["session"].get("audio", {}).get("output", {}).get("voice"))
            elif t == "error":
                raise SystemExit(f"error: {ev.get('error')}")
            elif t == "response.done":
                print("status:", ev["response"].get("status")); break
    with wave.open(args.out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(bytes(pcm))
    print(f"{args.out}: {len(pcm) / 48000:.2f} s")
    print("transcript:", "".join(transcript))

asyncio.run(main())
