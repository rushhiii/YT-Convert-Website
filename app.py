# yt_converter_backend/app.py

from flask import Flask, request, jsonify, send_file
import yt_dlp
import os
import uuid

app = Flask(__name__)
DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

@app.route("/api/info", methods=["POST"])
def get_info():
    url = request.json.get("url")
    if not url:
        return jsonify({"error": "Missing URL"}), 400

    ydl_opts = {
        "quiet": True,
        "skip_download": True,
        "forcejson": True,
        "simulate": True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = []
            for f in info.get("formats", []):
                formats.append({
                    "format_id": f["format_id"],
                    "ext": f["ext"],
                    "res": f.get("resolution") or f.get("height"),
                    "note": f.get("format_note") or f.get("abr"),
                    "audio_only": f.get("vcodec") == "none"
                })
            return jsonify({
                "title": info.get("title"),
                "duration": info.get("duration"),
                "thumbnail": info.get("thumbnail"),
                "formats": formats
            })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/download", methods=["POST"])
def download():
    url = request.json.get("url")
    format_id = request.json.get("format")
    audio_only = request.json.get("audio", False)

    if not url:
        return jsonify({"error": "Missing URL"}), 400

    ext = "mp3" if audio_only else "mp4"
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(DOWNLOAD_DIR, filename)

    ydl_opts = {
        "format": format_id if format_id else ("bestaudio" if audio_only else "best"),
        "outtmpl": filepath,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192"
        }] if audio_only else []
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return send_file(filepath, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
